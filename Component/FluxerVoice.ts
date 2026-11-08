import { EventEmitter, once } from "events";
import { setTimeout as sleep } from "timers/promises";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { Readable } from "stream";
import WebSocket from "ws";
import { Client, Events, GatewayOpcodes } from "@fluxerjs/core";
import { opus } from "prism-media";
import { MediaStream, MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from "werift";
import {
    AddTrackRequest, DisconnectReason, LeaveRequest, LeaveRequest_Action, MuteTrackRequest, Ping, SessionDescription, SignalRequest, SignalResponse,
    SignalTarget, TrackSource, TrackType, TrickleRequest
} from "@livekit/protocol";

const JOIN_TIMEOUT = 20000;
const SUBSCRIBE_TIMEOUT = 5000;
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]); // 20 ms CELT silence
const RECONNECT_ATTEMPTS = 6; // backoff 1s..30s, ~1 minute total
const ERR_JOIN_TIMEOUT = Error("Voice join timeout");
const ERR_NO_VOICE_SERVER = Error("Voice server unavailable");
const ERR_NOT_CONNECTED = Error("Voice not connected");
const ERR_DISCONNECTED = Error("Voice disconnected");

type SignalCase = NonNullable<SignalResponse["message"]["case"]>;
type SignalValue<K extends SignalCase> = Extract<SignalResponse["message"], { case: K }>["value"];

type VoiceStateUpdateData = Extract<Parameters<Client["sendToGateway"]>[1], { op: GatewayOpcodes.VoiceStateUpdate }>["d"];

interface IPendingJoin {
    channelId: string;
    mutationId: string;
    resolve(conn: VoiceConnection): void;
    reject(err: Error): void;
}

/**
 * Fluxer voice over LiveKit, publishing pre-encoded Ogg/Opus packets as RTP (no decode/re-encode).
 * Replaces @fluxerjs/voice, whose LiveKit SDK only accepts PCM. One connection per guild.
 */
export class FluxerVoice {
    private states = new Map<string, Map<string, string | null>>(); // guild -> user -> voice channel
    private connections = new Map<string, VoiceConnection>(); // guild -> connection
    private connectionIds = new Map<string, string>(); // guild -> connection_id (needed to leave)
    private pending = new Map<string, IPendingJoin>(); // guild -> join in progress

    // Must be created before login to receive voice states from READY/GUILD_CREATE
    constructor(private client: Client) {
        client.on(Events.VoiceStatesSync, ({ guildId, voiceStates }) => {
            for (const state of voiceStates) this.setState(guildId, state.user_id, state.channel_id);
        });
        client.on(Events.VoiceStateUpdate, data => {
            if (!data.guild_id) return;
            this.setState(data.guild_id, data.user_id, data.channel_id);
            if (data.user_id !== client.user?.id) return;
            if (data.connection_id) this.connectionIds.set(data.guild_id, data.connection_id);
            // Removed from voice by someone else (kick / channel deleted)
            if (!data.channel_id && !this.pending.has(data.guild_id)) this.connections.get(data.guild_id)?.disconnect("removed from voice channel");
        });
        client.on(Events.VoiceStateAck, data => {
            const entry = [...this.pending].find(([, p]) => p.mutationId === data.mutation_id);
            if (!entry) return;
            if (data.connection_id) this.connectionIds.set(entry[0], data.connection_id);
            if (data.status === "rejected" || data.error_code) {
                entry[1].reject(Error(`Voice join rejected: ${data.error_code ?? ""} ${data.error_message ?? ""}`.trim()));
            }
        });
        client.on(Events.VoiceServerUpdate, data => {
            const guildId = data.guild_id;
            if (!guildId) return;
            if (data.connection_id) this.connectionIds.set(guildId, data.connection_id);

            const pending = this.pending.get(guildId);
            const current = this.connections.get(guildId);
            if (!pending) {
                // Fresh grant for an existing connection: token refresh, or the voice server moved
                if (!current) return;
                if (data.endpoint && data.token) current.updateServer(data.endpoint, data.token, data.channel_id ?? current.channelId);
                else current.disconnect("voice server unavailable");
                return;
            }
            if (!data.endpoint || !data.token) {
                pending.reject(ERR_NO_VOICE_SERVER);
                return;
            }

            const conn = new VoiceConnection(guildId, pending.channelId, data.endpoint);
            this.connections.set(guildId, conn);
            conn.once("disconnect", () => {
                if (this.connections.get(guildId) === conn) this.connections.delete(guildId);
            });
            conn.connect(data.token).then(() => pending.resolve(conn), (err: Error) => {
                conn.disconnect(`join failed: ${err.message}`);
                pending.reject(err);
            });
        });
    }

    public getVoiceChannelId(guildId: string, userId: string) {
        return this.states.get(guildId)?.get(userId) ?? null;
    }

    public getConnection(guildId: string) {
        return this.connections.get(guildId);
    }

    public async join(guildId: string, channelId: string) {
        const current = this.connections.get(guildId);
        if (current?.channelId === channelId && current.isConnected()) return current;
        if (current) this.leave(guildId);
        this.pending.get(guildId)?.reject(Error("Voice join superseded"));

        return new Promise<VoiceConnection>((resolve, reject) => {
            const timer = setTimeout(() => pending.reject(ERR_JOIN_TIMEOUT), JOIN_TIMEOUT);
            const done = () => {
                clearTimeout(timer);
                if (this.pending.get(guildId) === pending) this.pending.delete(guildId);
            };
            const pending: IPendingJoin = {
                channelId,
                mutationId: randomUUID(),
                resolve: conn => { done(); resolve(conn); },
                reject: err => { done(); reject(err); }
            };
            this.pending.set(guildId, pending);
            this.sendVoiceState({ guild_id: guildId, channel_id: channelId, self_mute: false, self_deaf: false, mutation_id: pending.mutationId });
        });
    }

    public leave(guildId: string) {
        const conn = this.connections.get(guildId);
        this.connections.delete(guildId);
        conn?.disconnect("left");

        const connectionId = this.connectionIds.get(guildId);
        this.connectionIds.delete(guildId);
        if (connectionId) this.sendVoiceState({ guild_id: guildId, channel_id: null, connection_id: connectionId, self_mute: false, self_deaf: false });
    }

    private setState(guildId: string, userId: string, channelId: string | null | undefined) {
        let guild = this.states.get(guildId);
        if (!guild) this.states.set(guildId, guild = new Map<string, string | null>());
        guild.set(userId, channelId ?? null);
    }

    // mutation_id (matched by VoiceStateAck) is missing from the typed payload
    private sendVoiceState(d: VoiceStateUpdateData & { mutation_id?: string }) {
        this.client.sendToGateway(0, { op: GatewayOpcodes.VoiceStateUpdate, d });
    }
}

interface IPlayback {
    demuxer: Readable;
    timer: NodeJS.Timeout;
}

/**
 * Voice connection for one guild: player + a LiveKit session that is re-established when it drops.
 * Object identity (and listeners) survive reconnects; playback pauses while reconnecting and resumes in place.
 * @emits end - playback finished, was stopped, or failed (only if something was playing)
 * @emits error - playback error
 * @emits disconnect - connection closed for good (once)
 */
export class VoiceConnection extends EventEmitter {
    private session?: LiveKitSession;
    private token = "";
    private reconnecting = false;
    private closed = false;

    private current?: IPlayback;
    // RTP state is continuous across tracks; gaps advance the timestamp by wall time
    private seq = 0;
    private ts = 0;
    private endAt?: number; // wall time where the media sent so far ends (ts maps to this)

    constructor(public readonly guildId: string, public channelId: string, public endpoint: string) {
        super();
        // Default listener: an unhandled "error" event would crash the process
        this.on("error", err => console.error("[FluxerVoice] playback error:", err));
    }

    public get playing() {
        return !!this.current;
    }

    /** True until disconnected for good (also while reconnecting). */
    public isConnected() {
        return !this.closed && (!!this.session || this.reconnecting);
    }

    public async connect(token: string) {
        this.token = token;
        this.session = await this.openSession();
    }

    /**
     * New voice grant from the gateway: keep the token, and rejoin if the bot was moved to another
     * channel (one LiveKit room per channel, same endpoint) or the voice server changed.
     */
    public updateServer(endpoint: string, token: string, channelId = this.channelId) {
        const moved = endpoint !== this.endpoint || channelId !== this.channelId;
        this.endpoint = endpoint;
        this.channelId = channelId;
        this.token = token;
        if (moved && this.session) this.onSessionLost(this.session, false, true);
    }

    /** Start playing an Ogg/Opus file. Resolves once playback started; "end" fires when it finishes. */
    public async play(file: string) {
        this.stop();
        if (!this.isConnected()) throw ERR_NOT_CONNECTED;

        const input = createReadStream(file);
        await once(input, "open");
        const demuxer = input.pipe(new opus.OggDemuxer());
        const queue: Buffer[] = [];
        let ended = false;
        let first = true;
        let sentMs = 0;
        // Never start before already-sent media (e.g. trailing silence) has played out
        let start = Math.max(performance.now(), this.endAt ?? 0);
        let pausedAt: number | undefined;
        if (this.endAt !== undefined) this.ts = (this.ts + Math.round((start - this.endAt) * 48)) >>> 0;

        const playback: IPlayback = {
            demuxer,
            timer: setInterval(() => {
                // Hold position while reconnecting, then shift the clock by the pause
                if (!this.session) {
                    pausedAt ??= performance.now();
                    return;
                }
                if (pausedAt !== undefined) {
                    start += performance.now() - pausedAt;
                    pausedAt = undefined;
                    first = true;
                }

                const now = performance.now() - start;
                while (queue.length && sentMs <= now + 20) {
                    sentMs += this.writeRtp(this.session, queue.shift()!, first) / 48;
                    first = false;
                }
                this.endAt = start + sentMs;
                if (queue.length < 50 && demuxer.isPaused()) demuxer.resume();
                if (ended && !queue.length) this.finish(playback);
            }, 10)
        };
        this.current = playback;

        const fail = (err: Error) => {
            if (this.current !== playback) return;
            this.emit("error", err);
            this.stop();
        };
        input.on("error", fail);
        demuxer.on("error", fail);
        demuxer.on("data", (packet: Buffer) => {
            queue.push(packet);
            if (queue.length > 250) demuxer.pause();
        });
        demuxer.on("end", () => { ended = true; });
    }

    public stop() {
        if (this.current) this.finish(this.current);
    }

    public disconnect(reason: string) {
        if (this.closed) return;
        this.closed = true;
        console.log(`[FluxerVoice] Disconnected guild ${this.guildId} channel ${this.channelId}: ${reason}`);
        this.stop();
        this.session?.close(true);
        this.session = undefined;
        this.emit("disconnect");
    }

    private finish(playback: IPlayback) {
        if (this.current !== playback) return;
        this.current = undefined;
        clearInterval(playback.timer);
        playback.demuxer.destroy();
        // Trailing silence so receivers don't conceal (smear) the cut-off audio across the gap
        if (this.session) {
            for (let i = 0; i < 5; i++) this.writeRtp(this.session, SILENCE_FRAME, false);
            this.endAt = (this.endAt ?? performance.now()) + 100;
        }
        this.emit("end");
    }

    /** Send one Opus packet at the current RTP position; returns its samples. */
    private writeRtp(session: LiveKitSession, payload: Buffer, marker: boolean) {
        const samples = opusSamples(payload);
        session.write(new RtpPacket(new RtpHeader({ payloadType: 111, sequenceNumber: this.seq, timestamp: this.ts, marker }), payload));
        this.seq = (this.seq + 1) & 0xffff;
        this.ts = (this.ts + samples) >>> 0;
        return samples;
    }

    private async openSession() {
        const session = new LiveKitSession(this.endpoint, this.token);
        session.on("token", (token: string) => { this.token = token; });
        session.once("lost", (fatal: boolean, reason: string) => {
            if (session === this.session) console.warn(`[FluxerVoice] Session lost guild ${this.guildId}: ${reason}`);
            this.onSessionLost(session, fatal);
        });
        try {
            await session.open();
        } catch (err) {
            session.close(false);
            throw err;
        }
        if (session.lost) throw ERR_DISCONNECTED; // dropped right after opening
        return session;
    }

    private onSessionLost(session: LiveKitSession, fatal: boolean, immediate = false) {
        if (session !== this.session || this.closed) return;
        this.session = undefined;
        // A planned move leaves the old room on purpose; a drop keeps it resumable
        session.close(immediate);
        if (fatal) {
            this.disconnect("removed by voice server");
        } else {
            void this.reconnect(immediate);
        }
    }

    private async reconnect(immediate: boolean) {
        if (this.reconnecting) return;
        this.reconnecting = true;
        for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && !this.closed && !this.session; attempt++) {
            if (!immediate || attempt > 0) await sleep(Math.min(1000 * 2 ** attempt, 30000));
            if (this.closed) break;
            try {
                const session = await this.openSession();
                if (this.closed) {
                    session.close(true);
                } else {
                    this.session = session;
                    console.log(`[FluxerVoice] Reconnected guild ${this.guildId} channel ${this.channelId} (attempt ${attempt + 1})`);
                }
            } catch (err) {
                console.error(`[FluxerVoice] Reconnect attempt ${attempt + 1} failed:`, err);
            }
        }
        this.reconnecting = false;
        if (!this.session) this.disconnect("reconnect failed");
    }
}

/**
 * One LiveKit signaling session (v0 /rtc) with werift publisher/subscriber peers and one stereo Opus track.
 * @emits lost(fatal: boolean, reason: string) - session dropped; fatal when the server ended it for good (once)
 * @emits token(token: string) - refreshed access token for reconnecting
 */
class LiveKitSession extends EventEmitter {
    public lost = false;
    private ws?: WebSocket;
    private pub?: RTCPeerConnection;
    private sub?: RTCPeerConnection;
    private track = new MediaStreamTrack({ kind: "audio" });
    private trackSid?: string;
    private identity?: string;
    private pingTimer?: NodeJS.Timeout;
    private waiters = new Map<SignalCase, { filter(value: unknown): boolean; resolve(value: unknown): void }>();

    constructor(private endpoint: string, private token: string) {
        super();
    }

    public async open() {
        // Keep the path: self-hosted instances serve LiveKit under e.g. https://host/livekit
        const url = new URL(/^[a-z]+:\/\//i.test(this.endpoint) ? this.endpoint : `wss://${this.endpoint}`);
        url.protocol = url.protocol === "http:" || url.protocol === "ws:" ? "ws:" : "wss:";
        url.pathname = url.pathname.replace(/\/+$/, "") + "/rtc";
        url.search = new URLSearchParams({
            access_token: this.token, auto_subscribe: "0", sdk: "js", version: "2.23.0", protocol: "16", adaptive_stream: "0"
        }).toString();

        // ws package, not Node's built-in WebSocket: the built-in one drops the server's final "leave" before close
        const ws = this.ws = new WebSocket(url);
        ws.on("message", (data: Buffer) => this.onSignal(SignalResponse.fromBinary(data)).catch(err => console.error("[FluxerVoice] signal error:", err)));
        ws.on("close", (code, reason) => this.markLost(false, `signal socket closed (${code} ${reason.toString()})`));
        ws.on("error", err => console.error("[FluxerVoice] signal socket error:", err.message));

        const join = await this.wait("join");
        this.identity = join.participant?.identity;
        const iceServers = join.iceServers.map(s => ({ urls: s.urls[0], username: s.username || undefined, credential: s.credential || undefined }));
        const codecs = {
            audio: [new RTCRtpCodecParameters({
                mimeType: "audio/opus", clockRate: 48000, channels: 2,
                parameters: "minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1"
            })],
            video: []
        };
        this.pub = this.createPeer({ iceServers, codecs }, SignalTarget.PUBLISHER);
        this.sub = this.createPeer({ iceServers, codecs }, SignalTarget.SUBSCRIBER);
        this.pingTimer = setInterval(() => this.send({ case: "pingReq", value: new Ping({ timestamp: BigInt(Date.now()) }) }), (join.pingInterval || 5) * 1000);

        // Publish the track once; tracks are played into it, so listeners stay subscribed between songs
        this.pub.addTrack(this.track, new MediaStream([this.track]));
        const cid = this.track.id;
        const published = this.wait("trackPublished", v => v.cid === cid);
        this.send({
            case: "addTrack",
            value: new AddTrackRequest({ cid, name: "music", type: TrackType.AUDIO, source: TrackSource.MICROPHONE, stereo: true, disableDtx: true, disableRed: true })
        });
        const { track } = await published;
        this.trackSid = track?.sid;
        // The SFU drops packets until a listener's downtrack is bound, then sends trackSubscribed (once per track)
        const subscribed = this.wait("trackSubscribed", v => v.trackSid === track?.sid).catch(() => undefined);

        await this.pub.setLocalDescription(await this.pub.createOffer());
        this.send({ case: "offer", value: new SessionDescription({ type: "offer", sdp: this.pub.localDescription!.sdp, id: 1 }) });
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(ERR_NOT_CONNECTED), JOIN_TIMEOUT);
            const { unSubscribe } = this.pub!.connectionStateChange.subscribe(state => {
                if (state !== "connected") return;
                clearTimeout(timer);
                unSubscribe();
                resolve();
            });
            this.once("lost", () => reject(ERR_DISCONNECTED));
        });
        // Hold playback until someone can hear it; no listener (or an old server) just delays the start
        await Promise.race([subscribed, sleep(SUBSCRIBE_TIMEOUT)]);
    }

    public write(packet: RtpPacket) {
        this.track.writeRtp(packet);
    }

    /** Tear down; sendLeave tells the server we left on purpose (otherwise it may keep us for a resume). */
    public close(sendLeave: boolean) {
        this.lost = true;
        clearInterval(this.pingTimer);
        if (sendLeave) this.send({ case: "leave", value: new LeaveRequest({ reason: DisconnectReason.CLIENT_INITIATED }) });
        this.ws?.removeAllListeners("close");
        this.ws?.close();
        void this.pub?.close();
        void this.sub?.close();
    }

    private markLost(fatal: boolean, reason: string) {
        if (this.lost) return;
        this.lost = true;
        this.emit("lost", fatal, reason);
    }

    private createPeer(config: ConstructorParameters<typeof RTCPeerConnection>[0], target: SignalTarget) {
        const pc = new RTCPeerConnection(config);
        pc.onIceCandidate.subscribe(candidate => {
            if (candidate) this.send({ case: "trickle", value: new TrickleRequest({ candidateInit: JSON.stringify(candidate.toJSON()), target }) });
        });
        pc.connectionStateChange.subscribe(state => {
            if (state === "failed" || state === "closed") this.markLost(false, `${SignalTarget[target]} peer ${state}`);
        });
        return pc;
    }

    private send(message: SignalRequest["message"]) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(new SignalRequest({ message }).toBinary());
    }

    private wait<K extends SignalCase>(kind: K, filter: (value: SignalValue<K>) => boolean = () => true) {
        return new Promise<SignalValue<K>>((resolve, reject) => {
            const timer = setTimeout(() => reject(Error(`LiveKit: timeout waiting for ${kind}`)), JOIN_TIMEOUT);
            this.once("lost", () => reject(ERR_DISCONNECTED));
            this.waiters.set(kind, {
                filter: value => filter(value as SignalValue<K>),
                resolve: value => { clearTimeout(timer); (resolve as (v: unknown) => void)(value); }
            });
        });
    }

    private async onSignal({ message }: SignalResponse) {
        if (!message.case) return;
        const waiter = this.waiters.get(message.case);
        if (waiter?.filter(message.value)) {
            this.waiters.delete(message.case);
            waiter.resolve(message.value);
        }

        switch (message.case) {
            case "offer": { // server-initiated subscriber session
                await this.sub!.setRemoteDescription({ type: "offer", sdp: message.value.sdp });
                await this.sub!.setLocalDescription(await this.sub!.createAnswer());
                this.send({ case: "answer", value: new SessionDescription({ type: "answer", sdp: this.sub!.localDescription!.sdp, id: message.value.id }) });
                break;
            }
            case "answer":
                await this.pub!.setRemoteDescription({ type: "answer", sdp: message.value.sdp });
                break;
            case "trickle": {
                const pc = message.value.target === SignalTarget.PUBLISHER ? this.pub : this.sub;
                await pc?.addIceCandidate(JSON.parse(message.value.candidateInit) as Parameters<RTCPeerConnection["addIceCandidate"]>[0]);
                break;
            }
            case "update": {
                // Fluxer server mute = admin track mute + "server_mute" attribute. Remote unmute is disabled on the
                // server, so unmuting only drops the attribute and the client must unmute its own track
                const self = message.value.participants.find(p => p.identity === this.identity);
                if (self && !self.attributes.server_mute && self.tracks.some(t => t.sid === this.trackSid && t.muted)) {
                    console.log("[FluxerVoice] Server mute lifted, unmuting track");
                    this.send({ case: "mute", value: new MuteTrackRequest({ sid: this.trackSid, muted: false }) });
                }
                break;
            }
            case "refreshToken":
                this.token = message.value;
                this.emit("token", message.value);
                break;
            case "leave":
                // DISCONNECT = removed for good (kicked, room closed); RESUME/RECONNECT = rejoin
                this.markLost(message.value.action === LeaveRequest_Action.DISCONNECT && !message.value.canReconnect,
                    `server leave (action ${LeaveRequest_Action[message.value.action]}, reason ${DisconnectReason[message.value.reason]})`);
                break;
        }
    }
}

/** Samples (48 kHz) in one Opus packet, from its TOC byte (RFC 6716 section 3.1). */
export function opusSamples(packet: Buffer) {
    const config = packet[0] >> 3;
    const frameMs = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3];
    const code = packet[0] & 3;
    const frames = code === 0 ? 1 : code < 3 ? 2 : packet[1] & 0x3f;
    return frameMs * 48 * frames;
}
