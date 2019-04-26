workflow "TSLint" {
  on = "push"
  resolves = ["Run TSLint"]
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
