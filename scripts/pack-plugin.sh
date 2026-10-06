#!/bin/sh
# Builds dist/flat-planner-plugin-<version>.zip for "Upload local plugin" on claude.ai: the manifest and the skills
# in the standard layout (skills/<name>/SKILL.md), plus README and LICENSE.
set -e
cd "$(dirname "$0")/.."
v=$(node -p "require('./.claude-plugin/plugin.json').version")
out="$PWD/dist/flat-planner-plugin-$v.zip" stage="$PWD/dist/plugin"
rm -rf "$stage" "$out" && mkdir -p "$stage/.claude-plugin"
node -e "const m=require('./.claude-plugin/plugin.json'); delete m.skills; require('fs').writeFileSync('$stage/.claude-plugin/plugin.json', JSON.stringify(m, null, 2) + '\n')"
cp -R .claude/skills "$stage/skills" && cp README.md LICENSE "$stage/"
(cd "$stage" && zip -qr -X "$out" . -x '*.DS_Store')
rm -rf "$stage"
echo "dist/flat-planner-plugin-$v.zip"
