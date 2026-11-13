//! Skill library: folders of skill templates (Game, Video…) that a Boss is started with. One template =
//! `templates/<id>/` with `skills/`, `agents/`, `repos/` and `TEMPLATE.md`; third-party repos are cloned
//! into `repos/`. A session started with a template gets that template's skills and nothing from the
//! other templates: its root is a plugin (`--plugin-dir`), each repo a plugin, a set of plugins or a
//! project whose `.claude/skills` loads through `--add-dir`. The guide is `skill-library/HUONG_DAN.md`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{Issue, Severity};

pub const TEMPLATES_DIR: &str = "templates";
/// The templates every library starts with; their ids match the studio kinds (`src/lib/studios.ts`).
pub const DEFAULT_TEMPLATES: &[(&str, &str, &str)] = &[
    ("game", "Game", "Skills for making a game: design, code, art, audio, QA, release."),
    ("video", "Video", "Skills for a YouTube / video studio: script, edit, thumbnail, publishing."),
];
pub const GUIDE_VI: &str = include_str!("../../../skill-library/HUONG_DAN.md");
pub const GUIDE_EN: &str = include_str!("../../../skill-library/README.md");
const ID_MAX: usize = 40;
/// Characters a path may not hold: arguments of an npm-installed CLI go through `cmd.exe`.
const UNSAFE: &[char] = &['"', '%', '!', '^', '&', '|', '<', '>', '\n', '\r'];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    /// The template's own `skills/` and `agents/` (the template folder is a plugin).
    Own,
    /// A Claude Code plugin (`--plugin-dir`).
    Plugin,
    /// A Claude Code project whose `.claude/skills` loads through `--add-dir`.
    Project,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSource {
    pub kind: SourceKind,
    /// Folder name (`repos/<name>`, or the template id for its own skills).
    pub name: String,
    pub path: String,
    pub skills: Vec<SkillInfo>,
    /// Agent files (`agents/*.md`) that load with it.
    pub agents: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub sources: Vec<SkillSource>,
    pub issues: Vec<Issue>,
}

impl SkillTemplate {
    pub fn skill_count(&self) -> usize {
        self.sources.iter().map(|s| s.skills.len()).sum()
    }
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= ID_MAX && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Why `path` cannot be the library, or None when it can.
pub fn path_problem(path: &str) -> Option<String> {
    if path.trim().is_empty() {
        return Some("The folder is empty".into());
    }
    if let Some(c) = path.chars().find(|c| UNSAFE.contains(c)) {
        return Some(format!("The folder path may not contain `{c}`"));
    }
    if !Path::new(path).is_absolute() {
        return Some(format!("{path} is not a full path"));
    }
    None
}

/// Create what the fixed structure needs and is missing: the two guides, `templates/`, the default
/// templates and, in every template folder, `skills/`, `agents/`, `repos/` and `TEMPLATE.md`. Never
/// overwrites a file. Answers the folders and files it created.
pub fn ensure_structure(root: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut made = Vec::new();
    let dir = |p: PathBuf, made: &mut Vec<PathBuf>| -> std::io::Result<()> {
        if !p.is_dir() {
            std::fs::create_dir_all(&p)?;
            made.push(p);
        }
        Ok(())
    };
    let file = |p: PathBuf, text: &str, made: &mut Vec<PathBuf>| -> std::io::Result<()> {
        if !p.exists() {
            crate::utils::paths::write_atomic(&p, text.as_bytes())?;
            made.push(p);
        }
        Ok(())
    };
    dir(root.to_path_buf(), &mut made)?;
    file(root.join("HUONG_DAN.md"), GUIDE_VI, &mut made)?;
    file(root.join("README.md"), GUIDE_EN, &mut made)?;
    let templates = root.join(TEMPLATES_DIR);
    dir(templates.clone(), &mut made)?;
    for (id, _, _) in DEFAULT_TEMPLATES {
        dir(templates.join(id), &mut made)?;
    }
    for entry in std::fs::read_dir(&templates)?.flatten() {
        let id = entry.file_name().to_string_lossy().into_owned();
        if !entry.path().is_dir() || !valid_id(&id) {
            continue;
        }
        let t = entry.path();
        for sub in ["skills", "agents", "repos"] {
            dir(t.join(sub), &mut made)?;
        }
        let (name, text) = DEFAULT_TEMPLATES.iter().find(|(d, _, _)| *d == id).map(|(_, n, t)| (n.to_string(), t.to_string())).unwrap_or_else(|| (title_case(&id), String::new()));
        file(t.join("TEMPLATE.md"), &template_md(&name, &text), &mut made)?;
    }
    Ok(made)
}

fn template_md(name: &str, description: &str) -> String {
    format!(
        "---\nname: {name}\ndescription: {description}\n---\n\nSkill template for PrimeOffice. Own skills go in `skills/<name>/SKILL.md`, own agents in\n`agents/`, third-party repos are cloned into `repos/`. See `../../HUONG_DAN.md`.\n"
    )
}

fn title_case(id: &str) -> String {
    id.split('-').filter(|w| !w.is_empty()).map(|w| w[..1].to_uppercase() + &w[1..]).collect::<Vec<_>>().join(" ")
}

/// `name` and `description` of a Markdown file's YAML frontmatter (one-line values only).
pub fn frontmatter(text: &str) -> (Option<String>, Option<String>) {
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None);
    }
    let (mut name, mut description) = (None, None);
    for line in lines {
        if line.trim() == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else { continue };
        let value = value.trim().trim_matches(|c| c == '"' || c == '\'').trim().to_string();
        if value.is_empty() || value == "|" || value == ">" {
            continue;
        }
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = Some(value),
            _ => {}
        }
    }
    (name, description)
}

/// Skills in a `skills/` folder: each `<dir>/SKILL.md`.
fn skills_in(dir: &Path) -> Vec<SkillInfo> {
    let mut out: Vec<SkillInfo> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let file = e.path().join("SKILL.md");
            let text = std::fs::read_to_string(&file).ok()?;
            let (name, description) = frontmatter(&text);
            Some(SkillInfo { name: name.unwrap_or_else(|| e.file_name().to_string_lossy().into_owned()), description: description.unwrap_or_default() })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn agents_in(dir: &Path) -> usize {
    std::fs::read_dir(dir).into_iter().flatten().flatten().filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("md"))).count()
}

fn is_plugin(dir: &Path) -> bool {
    dir.join(".claude-plugin").join("plugin.json").is_file() || dir.join("skills").is_dir()
}

fn hidden(p: &Path) -> bool {
    p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.'))
}

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir() && !hidden(p)).collect();
    out.sort();
    out
}

fn source(kind: SourceKind, name: &str, path: &Path, skills: Vec<SkillInfo>, agents: usize) -> SkillSource {
    SkillSource { kind, name: name.into(), path: path.to_string_lossy().into_owned(), skills, agents }
}

/// One template: its own skills and every repo it can load.
pub fn read_template(dir: &Path) -> SkillTemplate {
    let id = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let (name, description) = std::fs::read_to_string(dir.join("TEMPLATE.md")).map(|t| frontmatter(&t)).unwrap_or((None, None));
    let mut sources = Vec::new();
    let mut issues = Vec::new();
    let (own_skills, own_agents) = (skills_in(&dir.join("skills")), agents_in(&dir.join("agents")));
    if !own_skills.is_empty() || own_agents > 0 {
        sources.push(source(SourceKind::Own, &id, dir, own_skills, own_agents));
    }
    for repo in subdirs(&dir.join("repos")) {
        let rname = repo.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if let Some(c) = repo.to_string_lossy().chars().find(|c| UNSAFE.contains(c)) {
            issues.push(Issue::new(Severity::Warn, "unsafe-path", format!("repos/{rname}: the path contains `{c}`; rename the folder")).at(&repo));
            continue;
        }
        let before = sources.len();
        if is_plugin(&repo) {
            sources.push(source(SourceKind::Plugin, &rname, &repo, skills_in(&repo.join("skills")), agents_in(&repo.join("agents"))));
        } else {
            for p in subdirs(&repo.join("plugins")).into_iter().filter(|p| is_plugin(p)) {
                let pname = format!("{rname}/{}", p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default());
                sources.push(source(SourceKind::Plugin, &pname, &p, skills_in(&p.join("skills")), agents_in(&p.join("agents"))));
            }
        }
        let claude = repo.join(".claude");
        // `--add-dir` loads both `.claude/skills` and `.claude/agents` (checked with CLI 2.1.322).
        let agents = agents_in(&claude.join("agents"));
        if claude.join("skills").is_dir() || agents > 0 {
            sources.push(source(SourceKind::Project, &rname, &repo, skills_in(&claude.join("skills")), agents));
        }
        if sources.len() == before {
            issues.push(Issue::new(Severity::Warn, "no-skills", format!("repos/{rname}: no plugin, plugins/ or .claude/skills found; nothing is loaded from it")).at(&repo));
        }
    }
    for extra in subdirs(dir).iter().filter(|p| !matches!(p.file_name().and_then(|n| n.to_str()), Some("skills" | "agents" | "repos"))) {
        let n = extra.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        issues.push(Issue::new(Severity::Info, "ignored-folder", format!("{n}/ is not part of a template (skills, agents, repos) and is ignored")).at(extra));
    }
    if sources.is_empty() {
        issues.push(Issue::new(Severity::Info, "empty-template", "No skills yet: add skills/<name>/SKILL.md or clone a repo into repos/"));
    }
    SkillTemplate {
        name: name.unwrap_or_else(|| title_case(&id)),
        description: description.unwrap_or_default(),
        path: dir.to_string_lossy().into_owned(),
        id,
        sources,
        issues,
    }
}

/// Every template of the library, by id. Folders whose name is not an id are skipped.
pub fn list_templates(root: &Path) -> Vec<SkillTemplate> {
    subdirs(&root.join(TEMPLATES_DIR))
        .into_iter()
        .filter(|d| d.file_name().and_then(|n| n.to_str()).is_some_and(valid_id))
        .map(|d| read_template(&d))
        .collect()
}

/// The Claude Code arguments that start a session with template `id` only: `--plugin-dir` for its own
/// folder and each plugin, `--add-dir` for each project repo, and, with `isolate`,
/// `--setting-sources project,local` (no personal skills, plugins or settings).
pub fn template_args(root: &Path, id: &str, isolate: bool) -> Result<Vec<String>, String> {
    if !valid_id(id) {
        return Err(format!("`{id}` is not a template name"));
    }
    if let Some(p) = path_problem(&root.to_string_lossy()) {
        return Err(format!("Skill library: {p}"));
    }
    let dir = root.join(TEMPLATES_DIR).join(id);
    if !dir.is_dir() {
        return Err(format!("Skill template `{id}` is not in the library ({})", root.display()));
    }
    let template = read_template(&dir);
    let mut args = Vec::new();
    for s in &template.sources {
        let flag = if s.kind == SourceKind::Project { "--add-dir" } else { "--plugin-dir" };
        args.extend([flag.to_string(), s.path.clone()]);
    }
    if isolate {
        args.extend(["--setting-sources".to_string(), "project,local".to_string()]);
    }
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill(dir: &Path, name: &str) {
        std::fs::create_dir_all(dir.join(name)).unwrap();
        std::fs::write(dir.join(name).join("SKILL.md"), format!("---\nname: {name}\ndescription: \"Does {name}.\"\n---\nBody\n")).unwrap();
    }

    #[test]
    fn structure_is_created_and_never_overwritten() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("lib");
        let made = ensure_structure(&root).unwrap();
        for p in ["HUONG_DAN.md", "README.md", "templates/game/TEMPLATE.md", "templates/game/skills", "templates/game/agents", "templates/game/repos", "templates/video/repos"] {
            assert!(root.join(p).exists(), "{p}");
        }
        assert!(!made.is_empty());
        std::fs::write(root.join("templates/game/TEMPLATE.md"), "---\nname: My Game\n---\n").unwrap();
        std::fs::create_dir_all(root.join("templates/marketing")).unwrap();
        std::fs::create_dir_all(root.join("templates/Not An Id")).unwrap();
        ensure_structure(&root).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("templates/game/TEMPLATE.md")).unwrap(), "---\nname: My Game\n---\n");
        assert!(root.join("templates/marketing/repos").is_dir(), "a new template folder gets the structure");
        assert!(!root.join("templates/Not An Id/repos").exists());
        let ids: Vec<String> = list_templates(&root).into_iter().map(|t| t.id).collect();
        assert_eq!(ids, ["game", "marketing", "video"]);
        assert_eq!(list_templates(&root)[1].name, "Marketing");
    }

    #[test]
    fn sources_and_args_cover_only_the_chosen_template() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("lib");
        ensure_structure(&root).unwrap();
        let game = root.join("templates/game");
        skill(&game.join("skills"), "level-design");
        std::fs::write(game.join("agents/boss.md"), "---\nname: boss\n---\n").unwrap();
        // A plugin, a marketplace, a project with agents, and a repo with nothing.
        skill(&game.join("repos/ue-plugin/skills"), "ue-gas");
        skill(&game.join("repos/market/plugins/audio/skills"), "metasound");
        std::fs::create_dir_all(game.join("repos/market/plugins/notes")).unwrap();
        skill(&game.join("repos/UEHF_Studio/.claude/skills"), "dev-story");
        std::fs::create_dir_all(game.join("repos/UEHF_Studio/.claude/agents")).unwrap();
        std::fs::write(game.join("repos/UEHF_Studio/.claude/agents/qa.md"), "x").unwrap();
        std::fs::create_dir_all(game.join("repos/empty")).unwrap();
        skill(&root.join("templates/video/skills"), "thumbnail");

        let t = read_template(&game);
        let names: Vec<(&SourceKind, &str)> = t.sources.iter().map(|s| (&s.kind, s.name.as_str())).collect();
        assert_eq!(names, [(&SourceKind::Own, "game"), (&SourceKind::Project, "UEHF_Studio"), (&SourceKind::Plugin, "market/audio"), (&SourceKind::Plugin, "ue-plugin")]);
        assert_eq!(t.skill_count(), 4);
        assert_eq!(t.sources[0].agents, 1);
        assert_eq!(t.sources[0].skills[0], SkillInfo { name: "level-design".into(), description: "Does level-design.".into() });
        let codes: Vec<&str> = t.issues.iter().map(|i| i.code.as_str()).collect();
        assert_eq!(codes, ["no-skills"]);
        assert_eq!(t.sources[1].agents, 1, "a project's .claude/agents come with --add-dir");

        let args = template_args(&root, "game", true).unwrap();
        let flags: Vec<&str> = args.iter().step_by(2).map(String::as_str).collect();
        assert_eq!(flags, ["--plugin-dir", "--add-dir", "--plugin-dir", "--plugin-dir", "--setting-sources"]);
        assert_eq!(args.last().unwrap(), "project,local");
        assert!(!args.iter().any(|a| a.contains("video")), "no other template is loaded");
        assert_eq!(template_args(&root, "game", false).unwrap().len(), 8);
        assert!(template_args(&root, "nope", false).is_err());
        assert!(template_args(&root, "../video", false).is_err());
    }

    #[test]
    fn unsafe_paths_are_refused() {
        assert!(path_problem("relative/lib").is_some());
        assert!(path_problem("").is_some());
        let base = if cfg!(windows) { "C:\\Skills" } else { "/skills" };
        assert!(path_problem(base).is_none());
        assert!(path_problem(&format!("{base}&calc")).is_some());
        assert!(path_problem(&format!("{base}\"x")).is_some());
    }

    #[test]
    fn frontmatter_reads_one_line_values() {
        assert_eq!(frontmatter("---\nname: a\ndescription: >\n  long\n---\n"), (Some("a".into()), None));
        assert_eq!(frontmatter("no frontmatter"), (None, None));
    }
}
