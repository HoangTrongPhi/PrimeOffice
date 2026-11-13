# PrimeOffice skill library

This folder holds **skill templates**: one set of skills per field (Game, Video…). When you add a **Boss** in
the Office (Add agent → Boss → *Skill template*), PrimeOffice starts Claude Code with that template's skills
only. The Boss hands work to its sub-agents, which use the same set. Other templates are not loaded.

Move this folder in **Settings (Ctrl+,) → Skill library → Change folder**. PrimeOffice creates the structure
below in the new folder; existing files are never overwritten.

## Structure (fixed)

```
<library>/
├── HUONG_DAN.md          ← Vietnamese guide
├── README.md             ← this file
└── templates/
    ├── game/             ← one template = one folder (name: a-z, 0-9, -)
    │   ├── TEMPLATE.md   ← display name + description (frontmatter `name`, `description`)
    │   ├── skills/       ← your own skills: skills/<skill-name>/SKILL.md
    │   ├── agents/       ← your own agents: agents/<name>.md
    │   └── repos/        ← clone third-party skill repos here
    └── video/
```

A new template is a new folder under `templates/`; PrimeOffice adds `skills/`, `agents/`, `repos/` and
`TEMPLATE.md` the next time Settings opens. A template named like a studio kind (`game`, `video`) is
preselected when you add a Boss in such a studio.

## Third-party skills

```powershell
cd "<library>\templates\game\repos"
git clone https://github.com/<owner>/<repo>.git
# later: cd <repo>; git pull
```

| Repo shape | Recognised by | Loaded with |
|---|---|---|
| Claude Code plugin | `.claude-plugin/plugin.json` or a `skills/` folder at its root | `--plugin-dir <repo>` |
| Marketplace of plugins | `plugins/<name>/` holding plugins | `--plugin-dir` per plugin |
| Claude Code project | `.claude/skills/` or `.claude/agents/` (e.g. UEHF_Studio) | `--add-dir <repo>` (its `.claude` skills and agents) |

Plugin skills show as `<plugin>:<skill>`; the plugin name comes from `plugin.json`, else the folder name.
Project skills and agents keep their own names.

**Only this template's skills** (Settings) adds `--setting-sources project,local`: personal skills,
user-level plugins and the skills that come with the claude.ai account are not loaded, and neither are the other
personal settings in `~/.claude/settings.json`. The project's own `.claude/` still loads, and so do Claude Code's
built-in skills (`code-review`, `init`, `simplify`…), which cannot be turned off one by one.

Clone only repos you trust. The library path may not contain `" % ! ^ & | < >`. Skills are attached when a
session starts: after changing a Boss's template, close its terminal and open it again.
