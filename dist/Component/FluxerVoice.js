"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceConnection = exports.FluxerVoice = void 0;
exports.opusSamples = opusSamples;
const events_1 = require("events");
const promises_1 = require("timers/promises");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const ws_1 = __importDefault(require("ws"));
const core_1 = require("@fluxerjs/core");
const prism_media_1 = require("prism-media");
const werift_1 = require("werift");
const protocol_1 = require("@livekit/protocol");
const JOIN_TIMEOUT = 20000;
const SUBSCRIBE_TIMEOUT = 5000;
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);
const RECONNECT_ATTEMPTS = 6;
const ERR_JOIN_TIMEOUT = Error("Voice join timeout");
const ERR_NO_VOICE_SERVER = Error("Voice server unavailable");
const ERR_NOT_CONNECTED = Error("Voice not connected");
const ERR_DISCONNECTED = Error("Voice disconnected");
class FluxerVoice {
    constructor(client) {
        this.client = client;
        this.states = new Map();
        this.connections = new Map();
        this.connectionIds = new Map();
        this.pending = new Map();
        client.on(core_1.Events.VoiceStatesSync, ({ guildId, voiceStates }) => {
            for (const state of voiceStates)
                this.setState(guildId, state.user_id, state.channel_id);
        });
        client.on(core_1.Events.VoiceStateUpdate, data => {
            if (!data.guild_id)
                return;
            this.setState(data.guild_id, data.user_id, data.channel_id);
            if (data.user_id !== client.user?.id || this.isOtherConnection(data.guild_id, data.connection_id))
                return;
            if (!data.channel_id && !this.pending.has(data.guild_id))
                this.connections.get(data.guild_id)?.disconnect("removed from voice channel");
        });
        client.on(core_1.Events.VoiceStateAck, data => {
            const entry = [...this.pending].find(([, p]) => p.mutationId === data.mutation_id);
            if (!entry)
                return;
            if (data.connection_id)
                this.connectionIds.set(entry[0], data.connection_id);
            if (data.status === "rejected" || data.error_code) {
                entry[1].reject(Error(`Voice join rejected: ${data.error_code ?? ""} ${data.error_message ?? ""}`.trim()));
            }
        });
        client.on(core_1.Events.VoiceServerUpdate, data => {
            const guildId = data.guild_id;
            if (!guildId || this.isOtherConnection(guildId, data.connection_id))
                return;
            if (data.connection_id)
                this.connectionIds.set(guildId, data.connection_id);
            const pending = this.pending.get(guildId);
            const current = this.connections.get(guildId);
            if (!pending) {
                if (!current)
                    return;
                if (data.endpoint && data.token)
                    current.updateServer(data.endpoint, data.token, data.channel_id ?? current.channelId);
                else
                    current.disconnect("voice server unavailable");
                return;
            }
            if (!data.endpoint || !data.token) {
                pending.reject(ERR_NO_VOICE_SERVER);
                return;
            }
            const conn = new VoiceConnection(guildId, pending.channelId, data.endpoint);
            this.connections.set(guildId, conn);
            conn.once("disconnect", () => {
                if (this.connections.get(guildId) === conn)
                    this.connections.delete(guildId);
            });
            conn.connect(data.token).then(() => pending.resolve(conn), (err) => {
                conn.disconnect(`join failed: ${err.message}`);
                pending.reject(err);
            });
        });
    }
    getVoiceChannelId(guildId, userId) {
        return this.states.get(guildId)?.get(userId) ?? null;
    }
    getConnection(guildId) {
        return this.connections.get(guildId);
    }
    async join(guildId, channelId) {
        const current = this.connections.get(guildId);
        if (current?.channelId === channelId && current.isConnected())
            return current;
        if (current)
            this.leave(guildId);
        this.connectionIds.delete(guildId);
        this.pending.get(guildId)?.reject(Error("Voice join superseded"));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => pending.reject(ERR_JOIN_TIMEOUT), JOIN_TIMEOUT);
            const done = () => {
                clearTimeout(timer);
                if (this.pending.get(guildId) === pending)
                    this.pending.delete(guildId);
            };
            const pending = {
                channelId,
                mutationId: (0, crypto_1.randomUUID)(),
                resolve: conn => { done(); resolve(conn); },
                reject: err => { done(); reject(err); }
            };
            this.pending.set(guildId, pending);
            this.sendVoiceState({ guild_id: guildId, channel_id: channelId, self_mute: false, self_deaf: false, mutation_id: pending.mutationId });
        });
    }
    leave(guildId) {
        const conn = this.connections.get(guildId);
        this.connections.delete(guildId);
        conn?.disconnect("left");
        const connectionId = this.connectionIds.get(guildId);
        this.connectionIds.delete(guildId);
        if (connectionId)
            this.sendVoiceState({ guild_id: guildId, channel_id: null, connection_id: connectionId, self_mute: false, self_deaf: false });
    }
    isOtherConnection(guildId, connectionId) {
        const ours = this.connectionIds.get(guildId);
        return !!connectionId && !!ours && connectionId !== ours;
    }
    setState(guildId, userId, channelId) {
        let guild = this.states.get(guildId);
        if (!guild)
            this.states.set(guildId, guild = new Map());
        guild.set(userId, channelId ?? null);
    }
    sendVoiceState(d) {
        this.client.sendToGateway(0, { op: core_1.GatewayOpcodes.VoiceStateUpdate, d });
    }
}
exports.FluxerVoice = FluxerVoice;
class VoiceConnection extends events_1.EventEmitter {
    constructor(guildId, channelId, endpoint) {
        super();
        this.guildId = guildId;
        this.channelId = channelId;
        this.endpoint = endpoint;
        this.token = "";
        this.reconnecting = false;
        this.closed = false;
        this.seq = 0;
        this.ts = 0;
        this.on("error", err => console.error("[FluxerVoice] playback error:", err));
    }
    get playing() {
        return !!this.current;
    }
    isConnected() {
        return !this.closed && (!!this.session || this.reconnecting);
    }
    async connect(token) {
        this.token = token;
        this.session = await this.openSession();
    }
    updateServer(endpoint, token, channelId = this.channelId) {
        const moved = endpoint !== this.endpoint || channelId !== this.channelId;
        this.endpoint = endpoint;
        this.channelId = channelId;
        this.token = token;
        if (moved && this.session)
            this.onSessionLost(this.session, false, true);
    }
    async play(file) {
        this.stop();
        if (!this.isConnected())
            throw ERR_NOT_CONNECTED;
        const input = (0, fs_1.createReadStream)(file);
        await (0, events_1.once)(input, "open");
        const demuxer = input.pipe(new prism_media_1.opus.OggDemuxer());
        const queue = [];
        let ended = false;
        let first = true;
        let sentMs = 0;
        let start = Math.max(performance.now(), this.endAt ?? 0);
        let pausedAt;
        if (this.endAt !== undefined)
            this.ts = (this.ts + Math.round((start - this.endAt) * 48)) >>> 0;
        const playback = {
            demuxer,
            timer: setInterval(() => {
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
                    sentMs += this.writeRtp(this.session, queue.shift(), first) / 48;
                    first = false;
                }
                this.endAt = start + sentMs;
                if (queue.length < 50 && demuxer.isPaused())
                    demuxer.resume();
                if (ended && !queue.length)
                    this.finish(playback);
            }, 10)
        };
        this.current = playback;
        const fail = (err) => {
            if (this.current !== playback)
                return;
            this.emit("error", err);
            this.stop();
        };
        input.on("error", fail);
        demuxer.on("error", fail);
        demuxer.on("data", (packet) => {
            queue.push(packet);
            if (queue.length > 250)
                demuxer.pause();
        });
        demuxer.on("end", () => { ended = true; });
    }
    stop() {
        if (this.current)
            this.finish(this.current);
    }
    disconnect(reason) {
        if (this.closed)
            return;
        this.closed = true;
        console.log(`[FluxerVoice] Disconnected guild ${this.guildId} channel ${this.channelId}: ${reason}`);
        this.stop();
        this.session?.close(true);
        this.session = undefined;
        this.emit("disconnect");
    }
    finish(playback) {
        if (this.current !== playback)
            return;
        this.current = undefined;
        clearInterval(playback.timer);
        playback.demuxer.destroy();
        if (this.session) {
            for (let i = 0; i < 5; i++)
                this.writeRtp(this.session, SILENCE_FRAME, false);
            this.endAt = (this.endAt ?? performance.now()) + 100;
        }
        this.emit("end");
    }
    writeRtp(session, payload, marker) {
        const samples = opusSamples(payload);
        session.write(new werift_1.RtpPacket(new werift_1.RtpHeader({ payloadType: 111, sequenceNumber: this.seq, timestamp: this.ts, marker }), payload));
        this.seq = (this.seq + 1) & 0xffff;
        this.ts = (this.ts + samples) >>> 0;
        return samples;
    }
    async openSession() {
        const session = new LiveKitSession(this.endpoint, this.token);
        session.on("token", (token) => { this.token = token; });
        session.once("lost", (fatal, reason) => {
            if (session === this.session)
                console.warn(`[FluxerVoice] Session lost guild ${this.guildId}: ${reason}`);
            this.onSessionLost(session, fatal);
        });
        try {
            await session.open();
        }
        catch (err) {
            session.close(false);
            throw err;
        }
        if (session.lost)
            throw ERR_DISCONNECTED;
        return session;
    }
    onSessionLost(session, fatal, immediate = false) {
        if (session !== this.session || this.closed)
            return;
        this.session = undefined;
        session.close(immediate);
        if (fatal) {
            this.disconnect("removed by voice server");
        }
        else {
            void this.reconnect(immediate);
        }
    }
    async reconnect(immediate) {
        if (this.reconnecting)
            return;
        this.reconnecting = true;
        for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && !this.closed && !this.session; attempt++) {
            if (!immediate || attempt > 0)
                await (0, promises_1.setTimeout)(Math.min(1000 * 2 ** attempt, 30000));
            if (this.closed)
                break;
            try {
                const session = await this.openSession();
                if (this.closed) {
                    session.close(true);
                }
                else {
                    this.session = session;
                    console.log(`[FluxerVoice] Reconnected guild ${this.guildId} channel ${this.channelId} (attempt ${attempt + 1})`);
                }
            }
            catch (err) {
                console.error(`[FluxerVoice] Reconnect attempt ${attempt + 1} failed:`, err);
            }
        }
        this.reconnecting = false;
        if (!this.session)
            this.disconnect("reconnect failed");
    }
}
exports.VoiceConnection = VoiceConnection;
class LiveKitSession extends events_1.EventEmitter {
    constructor(endpoint, token) {
        super();
        this.endpoint = endpoint;
        this.token = token;
        this.lost = false;
        this.track = new werift_1.MediaStreamTrack({ kind: "audio" });
        this.lastPong = Date.now();
        this.waiters = new Map();
    }
    async open() {
        const url = new URL(/^[a-z]+:\/\//i.test(this.endpoint) ? this.endpoint : `wss://${this.endpoint}`);
        url.protocol = url.protocol === "http:" || url.protocol === "ws:" ? "ws:" : "wss:";
        url.pathname = url.pathname.replace(/\/+$/, "") + "/rtc";
        url.search = new URLSearchParams({
            access_token: this.token, auto_subscribe: "0", sdk: "js", version: "2.23.0", protocol: "16", adaptive_stream: "0"
        }).toString();
        const ws = this.ws = new ws_1.default(url);
        ws.on("message", (data) => this.onSignal(protocol_1.SignalResponse.fromBinary(data)).catch(err => console.error("[FluxerVoice] signal error:", err)));
        ws.on("close", (code, reason) => this.markLost(false, `signal socket closed (${code} ${reason.toString()})`));
        ws.on("error", err => console.error("[FluxerVoice] signal socket error:", err.message));
        const join = await this.wait("join");
        this.identity = join.participant?.identity;
        const iceServers = join.iceServers.map(s => ({ urls: s.urls[0], username: s.username || undefined, credential: s.credential || undefined }));
        const codecs = {
            audio: [new werift_1.RTCRtpCodecParameters({
                    mimeType: "audio/opus", clockRate: 48000, channels: 2,
                    parameters: "minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1"
                })],
            video: []
        };
        this.pub = this.createPeer({ iceServers, codecs }, protocol_1.SignalTarget.PUBLISHER);
        this.sub = this.createPeer({ iceServers, codecs }, protocol_1.SignalTarget.SUBSCRIBER);
        const pingTimeout = (join.pingTimeout || 15) * 1000;
        this.lastPong = Date.now();
        this.pingTimer = setInterval(() => {
            if (Date.now() - this.lastPong > pingTimeout) {
                this.markLost(false, "signal ping timeout");
                return;
            }
            this.send({ case: "pingReq", value: new protocol_1.Ping({ timestamp: BigInt(Date.now()) }) });
        }, (join.pingInterval || 5) * 1000);
        this.pub.addTrack(this.track, new werift_1.MediaStream([this.track]));
        const cid = this.track.id;
        const published = this.wait("trackPublished", v => v.cid === cid);
        this.send({
            case: "addTrack",
            value: new protocol_1.AddTrackRequest({ cid, name: "music", type: protocol_1.TrackType.AUDIO, source: protocol_1.TrackSource.MICROPHONE, stereo: true, disableDtx: true, disableRed: true })
        });
        const { track } = await published;
        this.trackSid = track?.sid;
        const subscribed = this.wait("trackSubscribed", v => v.trackSid === track?.sid).catch(() => undefined);
        await this.pub.setLocalDescription(await this.pub.createOffer());
        this.send({ case: "offer", value: new protocol_1.SessionDescription({ type: "offer", sdp: this.pub.localDescription.sdp, id: 1 }) });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(ERR_NOT_CONNECTED), JOIN_TIMEOUT);
            const { unSubscribe } = this.pub.connectionStateChange.subscribe(state => {
                if (state !== "connected")
                    return;
                clearTimeout(timer);
                unSubscribe();
                resolve();
            });
            this.once("lost", () => reject(ERR_DISCONNECTED));
        });
        await Promise.race([subscribed, (0, promises_1.setTimeout)(SUBSCRIBE_TIMEOUT)]);
    }
    write(packet) {
        this.track.writeRtp(packet);
    }
    close(sendLeave) {
        this.lost = true;
        clearInterval(this.pingTimer);
        if (sendLeave)
            this.send({ case: "leave", value: new protocol_1.LeaveRequest({ reason: protocol_1.DisconnectReason.CLIENT_INITIATED }) });
        this.ws?.removeAllListeners("close");
        this.ws?.close();
        void this.pub?.close();
        void this.sub?.close();
    }
    markLost(fatal, reason) {
        if (this.lost)
            return;
        this.lost = true;
        this.emit("lost", fatal, reason);
    }
    createPeer(config, target) {
        const pc = new werift_1.RTCPeerConnection(config);
        pc.onIceCandidate.subscribe(candidate => {
            if (candidate)
                this.send({ case: "trickle", value: new protocol_1.TrickleRequest({ candidateInit: JSON.stringify(candidate.toJSON()), target }) });
        });
        pc.connectionStateChange.subscribe(state => {
            if (state === "failed" || state === "closed")
                this.markLost(false, `${protocol_1.SignalTarget[target]} peer ${state}`);
        });
        return pc;
    }
    send(message) {
        if (this.ws?.readyState === ws_1.default.OPEN)
            this.ws.send(new protocol_1.SignalRequest({ message }).toBinary());
    }
    wait(kind, filter = () => true) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error(`LiveKit: timeout waiting for ${kind}`)), JOIN_TIMEOUT);
            this.once("lost", () => reject(ERR_DISCONNECTED));
            this.waiters.set(kind, {
                filter: value => filter(value),
                resolve: value => { clearTimeout(timer); resolve(value); }
            });
        });
    }
    async onSignal({ message }) {
        if (!message.case)
            return;
        const waiter = this.waiters.get(message.case);
        if (waiter?.filter(message.value)) {
            this.waiters.delete(message.case);
            waiter.resolve(message.value);
        }
        switch (message.case) {
            case "offer": {
                await this.sub.setRemoteDescription({ type: "offer", sdp: message.value.sdp });
                await this.sub.setLocalDescription(await this.sub.createAnswer());
                this.send({ case: "answer", value: new protocol_1.SessionDescription({ type: "answer", sdp: this.sub.localDescription.sdp, id: message.value.id }) });
                break;
            }
            case "answer":
                await this.pub.setRemoteDescription({ type: "answer", sdp: message.value.sdp });
                break;
            case "trickle": {
                const pc = message.value.target === protocol_1.SignalTarget.PUBLISHER ? this.pub : this.sub;
                await pc?.addIceCandidate(JSON.parse(message.value.candidateInit));
                break;
            }
            case "update": {
                const self = message.value.participants.find(p => p.identity === this.identity);
                if (self && !self.attributes.server_mute && self.tracks.some(t => t.sid === this.trackSid && t.muted)) {
                    console.log("[FluxerVoice] Server mute lifted, unmuting track");
                    this.send({ case: "mute", value: new protocol_1.MuteTrackRequest({ sid: this.trackSid, muted: false }) });
                }
                break;
            }
            case "pongResp":
                this.lastPong = Date.now();
                break;
            case "refreshToken":
                this.token = message.value;
                this.emit("token", message.value);
                break;
            case "leave":
                this.markLost(message.value.action === protocol_1.LeaveRequest_Action.DISCONNECT && !message.value.canReconnect, `server leave (action ${protocol_1.LeaveRequest_Action[message.value.action]}, reason ${protocol_1.DisconnectReason[message.value.reason]})`);
                break;
        }
    }
}
function opusSamples(packet) {
    const config = packet[0] >> 3;
    const frameMs = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3];
    const code = packet[0] & 3;
    const frames = code === 0 ? 1 : code < 3 ? 2 : packet[1] & 0x3f;
    return frameMs * 48 * frames;
}
