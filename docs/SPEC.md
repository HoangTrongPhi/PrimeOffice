# PrimeOffice — Pixel office for your AI coding agents

> **Ưu tiên**: 11 · **Dùng cho**: theo dõi các phiên agent (Claude Code hôm nay; Codex/ChatGPT, Gemini,
> DeepSeek sau) dưới dạng văn phòng pixel · **MVP**: hết P5 (v0.1.0)
> **Đọc trước**: `00_SHARED_FRAMEWORK.md`. Tiền điều kiện: `00_TEMPLATE_UPGRADE.md` đã xong.
> **Nguồn gốc**: fork `P:\Phineas_LIB\Gogo_Gadgets\pixel-agents` (upstream `pixel-agents-hq/pixel-agents`,
> MIT, commit `b1bafd0` v1.5.0). Khảo sát chi tiết: `pixel-agents/docs/SURVEY.md`.
> **Tạo app**:
> `npm run new-app -- "PrimeOffice" --tagline "Pixel office for your AI coding agents" --category "AI Agents" --spec docs/app-specs/11_PRIMEOFFICE.md`

## 1. Mục tiêu

1. **Văn phòng pixel**: mỗi phiên agent là một nhân vật; đi tới bàn, gõ khi sửa file, đọc khi tìm kiếm,
   bong bóng khi chờ người dùng. Engine render, editor layout, nội thất lấy lại từ pixel-agents.
2. **Mở bất kỳ folder project nào**: nếu đạt chuẩn thì xem được các agent của project đó; nếu chưa đạt
   thì liệt kê **đủ mọi thứ còn thiếu**, mỗi mục kèm cách sửa.
3. **Lịch sử vắn tắt**: với mỗi phiên — tiêu đề, prompt gần nhất, các việc vừa làm (file sửa, lệnh chạy,
   tìm kiếm), câu trả lời cuối của agent, thời điểm.
4. **Đa provider**: kiến trúc `AgentProvider` để sau này thêm Codex/ChatGPT, Gemini, DeepSeek mà không đổi UI.
5. **Giao diện pixel tốt hơn**: bộ nhân vật/nội thất tự sinh (CC0 của chính dự án) + danh sách tài nguyên
   miễn phí đã kiểm tra license.

### Quyết định đã chốt (2026-11-09, người dùng)
- **Backend Rust gốc**, không nhúng Node sidecar. Quan sát bằng cách đọc transcript JSONL; không sửa
  `~/.claude/settings.json` ở v0.1 (hook để sau, xem P7).
- **Chuẩn project = "agent + Abyss"** (§3.2).
- App nằm ở `P:\Phineas_LIB\Gogo_Gadgets\PrimeOffice`; `pixel-agents` giữ nguyên làm nguồn tham chiếu.

### Ngoài phạm vi v1
- Terminal nhúng, launch agent từ app, duyệt quyền thay người dùng (GUI chỉ **quan sát**).
- Gửi prompt tới agent; gọi API LLM trả phí.
- Đồng bộ nhiều máy / server trung tâm.

## 2. Luồng chính

| # | Luồng | Kết quả |
|---|---|---|
| U1 | Mở app | Văn phòng hiện mọi phiên Claude đang hoạt động trong N phút gần đây (mặc định 30), mỗi phiên một nhân vật |
| U2 | `Ctrl+O` chọn folder project | Báo cáo chuẩn: ✓/✗ từng mục, mục thiếu kèm "cách sửa"; đạt mục bắt buộc → project vào danh sách, office lọc theo project |
| U3 | Bấm một nhân vật / một phiên ở tab History | Panel: tiêu đề phiên, prompt gần nhất, 20 hành động gần nhất, câu trả lời cuối, model, context đã dùng |
| U4 | Tab Providers | Thấy Claude (đang hoạt động, số phiên), Codex/Gemini (phát hiện được thư mục phiên hay chưa), DeepSeek (chưa hỗ trợ) |
| U5 | CI / script: `primeoffice check <folder> --report r.json` | Mã thoát 0/1/2 theo chuẩn project |
| U6 | `primeoffice history <folder> --last 5` | In 5 phiên gần nhất của project: tiêu đề, prompt gần nhất, tóm tắt |

## 3. Mô hình dữ liệu

### 3.1 Phiên (`AgentSession`)

```jsonc
{
  "provider": "claude",               // claude | codex | gemini | deepseek
  "sessionId": "98ed76b8-…",
  "title": "PrimeOffice app setup",   // custom-title / agent-name, rỗng thì cắt prompt đầu
  "cwd": "P:\\Phineas_LIB\\Gogo_Gadgets",
  "transcriptPath": "C:\\Users\\…\\.claude\\projects\\…\\98ed….jsonl",
  "entrypoint": "claude-desktop",     // cli | claude-desktop | …
  "model": "claude-opus-5-5",
  "startedAt": "…", "lastActivityAt": "…",
  "status": "active",                 // active | waiting | done | stale
  "lastPrompt": "…",                  // cắt 500 ký tự
  "lastReply": "…",                   // text cuối của assistant, cắt 500 ký tự
  "contextTokens": 77194,
  "actions": [ { "at": "…", "kind": "edit", "tool": "Edit", "label": "Editing App.tsx" } ]  // ≤ 50, mới nhất cuối
}
```

### 3.2 Chuẩn project (`ProjectReport`)

| Mã | Mức | Kiểm tra | Cách sửa (hiện trong UI) |
|---|---|---|---|
| `folder.exists` | error | Thư mục tồn tại, đọc được | Chọn lại thư mục |
| `agent.sessions` | error | Có ít nhất một phiên của provider nào đó cho folder này (Claude: `~/.claude/projects/<normalize(cwd)>/*.jsonl`, so khớp không phân biệt hoa thường) | Chạy `claude` trong thư mục này một lần |
| `agent.claudeMd` | warn | Có `CLAUDE.md` (hoặc `AGENTS.md`) ở gốc | Tạo bằng `/init` trong Claude Code |
| `agent.settings` | info | Có `.claude/` | Tuỳ chọn: settings/skills riêng của project |
| `vcs.git` | warn | Có `.git/` | `git init` |
| `abyss.spec` | warn | Có `docs/SPEC.md` | Theo `Abyss/docs/app-specs/00_SHARED_FRAMEWORK.md` §3 |
| `abyss.progress` | warn | Có `docs/PROGRESS.md` | Mẫu ở §15 khung chung |
| `abyss.changelog` | info | Có `docs/CHANGELOG.md` | |
| `abyss.readme` | info | Có `README.md` | |

Project **xem được** khi không có issue mức `error`. Báo cáo theo chuẩn khung chung: `{ ok, elapsedMs,
issues[] }` với `{ severity, code, message, fix?, path? }`. Danh sách project đã mở lưu ở
`app_data_dir()/projects.json`.

### 3.3 Provider (`AgentProvider` trait, `core/providers/`)

```rust
pub trait AgentProvider: Send + Sync {
    fn id(&self) -> &'static str;                 // "claude"
    fn display_name(&self) -> &'static str;
    fn detect(&self) -> ProviderStatus;           // installed?, session root, note
    fn session_roots(&self) -> Vec<PathBuf>;      // thư mục cần quét
    fn sessions_for_project(&self, dir: &Path) -> Vec<PathBuf>;
    fn read_session(&self, path: &Path, limits: &ReadLimits) -> Result<AgentSession, CoreError>;
}
```

| Provider | v0.1 | Nguồn phiên (**kiểm chứng** trước khi làm) |
|---|---|---|
| Claude Code | đầy đủ | `~/.claude/projects/<normalize(cwd)>/<session>.jsonl`; dòng `user`/`assistant`/`last-prompt`/`custom-title` |
| Codex CLI (ChatGPT) | chỉ detect | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (nguồn thứ ba, chưa xác minh) |
| Gemini CLI | chỉ detect | `~/.gemini/tmp/<hash>/…` (chưa xác minh) |
| DeepSeek | "chưa hỗ trợ" | Không có CLI agent chính thức; khả năng qua công cụ trung gian (Aider/Cline…) — câu hỏi mở Q3 |

## 4. Kiến trúc

```
src-tauri/src/core/
  providers/mod.rs         AgentProvider trait, registry, ProviderStatus
  providers/claude.rs      parse JSONL → AgentSession; normalize_project_path (giống core/src/normalizeProjectPath.ts)
  providers/codex.rs       detect()
  providers/gemini.rs      detect()
  activity.rs              tool → kind/label ("Editing App.tsx", "Running npm test") — port formatToolStatus
  project.rs               check_project() → ProjectReport (§3.2)
  observer.rs              quét + tail các transcript, sinh OfficeEvent (diff trạng thái giữa hai lần quét)
src-tauri/src/commands/
  project_cmd.rs           check_project, list_projects, add_project, remove_project
  session_cmd.rs           list_sessions, get_session
  office_cmd.rs            office_start / office_stop / save_layout / load_layout
  provider_cmd.rs          list_providers
src/office/                engine văn phòng vendored từ pixel-agents/webview-ui (+ core/src cần thiết),
                           ghi upstream commit trong src/office/VENDORED.md
src/office/transport/tauriTransport.ts   MessageTransport: listen("office://message") + invoke("office_send")
```

- Rust phát **đúng các `ServerMessage` của pixel-agents** (`agentCreated`, `agentToolStart`, `agentToolDone`,
  `agentStatus`, `agentClosed`, `existingAgents`, `layoutLoaded`, `settingsLoaded`, `agentContextUsage`) qua
  event `office://message`. Nhờ vậy `useExtensionMessages.ts` dùng lại nguyên vẹn.
- Asset (nhân vật, sàn, tường, nội thất) nằm trong `public/assets`, decode PNG trong webview (đường browser của
  pixel-agents). `scripts/build-assets.mjs` sinh `asset-index.json` + `furniture-catalog.json`.
- Layout lưu ở `app_data_dir()/layout.json` (ghi nguyên tử).
- Observer: quét mỗi 1 s các file `.jsonl` có mtime trong cửa sổ hoạt động; đọc tăng dần từ offset cũ;
  agent không có dòng mới quá `idleSeconds` (mặc định 5 s) sau `turn` kết thúc → `waiting`; quá cửa sổ
  hoạt động → `agentClosed`.

## 5. UI

Rail (template): **Office** (`Ctrl+1`), **Projects** (`Ctrl+2`), **History** (`Ctrl+3`), **Providers** (`Ctrl+4`).

- **Office**: canvas văn phòng + thanh dưới (zoom, edit layout, filter theo project) + panel phải khi chọn nhân vật (U3).
- **Projects**: nút Open folder, danh sách project đã mở (pill Ready / Missing N), báo cáo chuẩn dạng checklist
  có nút Copy fix.
- **History**: danh sách phiên mới nhất (lọc theo project/provider), mỗi dòng: tiêu đề, prompt gần nhất, 3 hành động
  cuối, thời gian tương đối; mở ra xem đầy đủ.
- **Providers**: thẻ mỗi provider với trạng thái detect.

## 6. CLI

```
primeoffice check <folder> [--report r.json] [--fail-on warn|error] [--quiet]
primeoffice history <folder> [--last N] [--report r.json]
primeoffice providers
```

## 7. Phases

| Phase | Nội dung | Xong khi |
|---|---|---|
| P0 | Scaffold bằng `new-app`, PROGRESS.md, `npm run check` xanh | App mở được, rail 4 module |
| P1 | Core: `claude.rs`, `activity.rs`, `project.rs` + test (fixture JSONL sinh trong test) | `cargo test` xanh; `primeoffice check`, `history` chạy trên máy thật |
| P2 | Vendor engine office + `tauriTransport` + assets; observer phát ServerMessage | Mở app thấy nhân vật của phiên Claude thật, gõ/đọc theo tool |
| P3 | Projects + History + Providers UI, mock đủ command | Đi hết U2–U4 trong `?mock`, không lỗi console |
| P4 | Bộ nhân vật tự sinh (CC0) + docs/ASSETS.md (nguồn miễn phí + license) | 6+ nhân vật mới đúng format 112×96; chọn bộ asset trong Settings |
| P5 | Release 0.1.0 (chỉ khi người dùng cho phép), catalog `available` | Cài được từ Abyss |
| P6 | Codex/Gemini provider đầy đủ (sau khi kiểm chứng format) | Nhân vật Codex/Gemini xuất hiện |
| P7 | (tuỳ chọn) Hook Claude qua chính `primeoffice.exe hook` để có trạng thái quyền chính xác | Bong bóng "…" khi chờ quyền |

## 8. Câu hỏi mở
- Q1: Cửa sổ "đang hoạt động" mặc định 30 phút có hợp không?
- Q2: History có cần tóm tắt bằng LLM (tốn phí) hay chỉ tóm tắt cơ học từ tool/prompt? (v0.1: cơ học)
- Q3: DeepSeek dùng qua công cụ nào (Aider, Cline, Roo, API trực tiếp)?
- Q4: Có muốn giữ nhân vật gốc của pixel-agents (dựa trên pack JIK-A-4, license chưa rõ) song song bộ tự sinh không?

## 9. Rủi ro
- Format transcript của Claude Code không có hợp đồng công khai → parser phải chịu dòng lạ (bỏ qua, không lỗi).
- Engine vendored lệch upstream → ghi commit trong `VENDORED.md`, chỉ sửa tối thiểu.
- License nhân vật gốc (JIK-A-4) chưa rõ → không đưa vào bản phát hành công khai nếu chưa xác minh (Q4).
