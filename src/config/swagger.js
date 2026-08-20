const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// openapi.yaml lives at the project root (per the spec), not under src/ — hence
// the ../.. hop. The Dockerfile copies it alongside src/ so this resolves in the
// container too.
const SPEC_PATH = path.join(__dirname, '..', '..', 'openapi.yaml');

module.exports = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8'));
