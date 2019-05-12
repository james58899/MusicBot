workflow "Push" {
  resolves = ["Run TSLint"]
  on = "push"
}

workflow "PR" {
  resolves = ["Run TSLint"]
  on = "pull_request"
}

action "Init" {
  uses = "docker://node"
  runs = "yarn"
}

action "Run TSLint" {
  uses = "docker://node"
  needs = ["Init"]
  runs = "yarn"
  args = "tslint"
}
