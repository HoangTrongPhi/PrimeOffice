# PrimeOffice × Munder Difflin — kế hoạch tích hợp

> Lập 2026-11-11. Nguồn: `P:\Phineas_LIB\Gogo_Gadgets\cusMunderDifflin` (Munder Difflin 0.5.6, mã MIT,
> pixel art LimeZu **không** thuộc MIT) và tài liệu "Repo multi-agent & multi-account cho Claude, Codex,
> Gemini (11/2026)". Trạng thái từng bước nằm ở `PROGRESS.md`.

## 1. Mục tiêu

Một văn phòng cho cả ba gói đang trả tiền — Claude (Claude Code), ChatGPT (Codex CLI), Google (Gemini CLI /
Antigravity) — mỗi gói một tài khoản, đăng nhập chính thức trong CLI của hãng. PrimeOffice thấy cả ba, biết
gói nào còn hạn mức, và (từ M3) mở agent đúng CLI cho từng việc.

## 2. Ranh giới điều khoản dịch vụ (bắt buộc, áp cho mọi bước)

| Được làm | Không làm |
|---|---|
| Chạy đúng file CLI của hãng (`claude`, `codex`, `gemini`/`agy`) như một tiến trình bình thường | Đọc, sao chép hay gửi đi token OAuth (`~/.codex/auth.json`, credential của Claude/Google) |
| Đăng nhập bằng luồng của chính CLI, người dùng tự làm | Proxy biến gói subscription thành API (CLIProxyAPI, Antigravity-Manager) |
| Đọc transcript / file phiên trên máy (chỉ đọc) | Nhiều tài khoản cùng một hãng, xoay vòng khi gặp 429/401 |
| Một tài khoản mỗi hãng; hết hạn mức thì chuyển việc sang **hãng khác** | Đặt proxy giữa CLI và máy chủ của hãng (tầng `proxy` của Munder Difflin) |
| Giao việc giữa các agent bằng chế độ không tương tác **có trong tài liệu** của CLI (`codex exec`, `claude -p`, `gemini -p`) | `hiddenClaude.ts`: phiên Claude ẩn gõ tự động vào TUI để lấy hạn mức gói tương tác thay cho hạn mức Agent SDK |

Anthropic — tra ngày 2026-11-11 (kết quả tìm kiếm, chưa đọc nguyên văn từng trang):
- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance): đăng nhập OAuth dành cho người mua
  gói, để dùng Claude Code bình thường; nhà phát triển bên thứ ba không được đưa đăng nhập Claude.ai vào app của họ
  hay chuyển request qua credential gói tiêu dùng cho người dùng của họ; không sửa binary Claude Code.
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan):
  khi đăng nhập bằng gói, Agent SDK và `claude -p` tính vào hạn mức gói (thay đổi tách hạn mức đã tạm dừng 6/2026).
- [Headless mode](https://code.claude.com/docs/en/headless.md): `claude -p` là chế độ có trong tài liệu.

Cách PrimeOffice đứng trong ranh giới đó (đây là cách tôi đọc, không phải xác nhận của Anthropic): app không có màn
hình đăng nhập, không giữ credential, không gọi máy chủ Anthropic; nó chạy binary `claude` nguyên bản mà người dùng
tự cài và tự đăng nhập, trên máy của chính họ, khi họ gửi tin nhắn. Nếu sau này PrimeOffice phát hành cho người khác
với Chat bật sẵn, nên đọc lại nguyên văn trang Legal trước khi phát hành.

OpenAI và Google: chưa tra. Phải tra trước khi Chat chạy Codex / Gemini; nếu một hãng không cho, bỏ hãng ấy.

## 3. Lấy gì, bỏ gì từ Munder Difflin

| Tính năng Munder Difflin | Quyết định | Lý do |
|---|---|---|
| Sàn văn phòng Pixi + bộ nhân vật The Office + tileset LimeZu | **Bỏ** | Trùng: PrimeOffice đã có văn phòng pixel-agents, phòng ban, floor plan; art LimeZu không dùng lại được |
| Đọc transcript Claude lấy token/chi phí (`transcript.ts`) | **Bỏ phần đọc, lấy phần chi phí** | Trùng `providers/claude.rs`; chỉ thiếu bảng giá + tổng token |
| Monaco IDE, git rails | **Bỏ** | Đã có IDE riêng; ngoài mục tiêu |
| Stapler (đọc chính tả, ghi họp), Slack, webhook, Teams, Capabilities marketplace, telemetry, licence Pro | **Bỏ** | Ngoài mục tiêu; một phần là tính năng trả phí của họ |
| MemPalace / Knowledge Graph | **Bỏ** | Phụ thuộc ngoài (Python); memory markdown là đủ |
| Preset provider (`shared/agentProvider.ts`): lệnh, cờ model, cờ resume, lệnh cài | **Lấy** (M3) | Bảng dữ liệu, port sang Rust; chỉ giữ claude / codex / gemini / antigravity / custom |
| Thẻ agent: engine, model, thước context, việc đang làm | **Lấy** (M2) | PrimeOffice đã có gần đủ dữ liệu |
| Hạn mức theo chu kỳ (5 giờ / tuần) + ngân sách token | **Lấy** (M2) | Trọng tâm "dùng hết 3 gói": biết gói nào còn |
| Terminal thật cho mỗi agent (node-pty + xterm) | **Lấy** (M3) | Rust `portable-pty`; `@xterm/xterm` đã có trong package.json |
| Git worktree cho từng agent | **Lấy** (M3) | Agent song song không đụng nhánh nhau |
| Hook server (`hooks.ts`, `cth-hook`) | **Lấy** (M3, = P7 cũ) | Trạng thái chờ quyền chính xác thay cho đoán 10 giây |
| Hive: mailbox file nguyên tử, router, blackboard, sổ task (`HIVE.md`) | **Lấy bản rút gọn** (M4) | Chỉ mailbox + sổ task; không git-commit mỗi tin |
| Orchestrator "Michael" (GOD agent) | **Lấy ý tưởng** (M4) | Một phiên Claude làm trưởng nhóm, gọi Codex/Gemini — đúng mô hình oh-my-claudecode trong tài liệu |
| Circuit breaker (steer → constrain → stop) | **Lấy bản rút gọn** (M4) | Chỉ cần khi PrimeOffice tự chạy agent |
| Kanban task có khoá + phụ thuộc | **Để sau** (M5) | Chỉ có nghĩa sau M4 |
| Compact/clear tự động + `handoff.md` | **Để sau** (M5) | Tiết kiệm token; cần M3 |

## 4. Các mốc

| Mốc | Nội dung | Xong khi | Đổi phạm vi? |
|---|---|---|---|
| **M1** | Quan sát đủ 3 hãng: parser Codex (rollout JSONL), rồi Gemini CLI / Antigravity | Phiên Codex và Gemini hiện thành nhân vật, có History | Không (= P6) |
| **M2** | Hạn mức & chi phí: `rate_limits` của Codex, token theo cửa sổ 5 giờ / tuần của Claude, thẻ "3 gói" ở tab Agents | Nhìn một chỗ biết gói nào còn bao nhiêu | Không |
| **M3** | Chạy agent từ app: preset provider, PTY + xterm, worktree, hook Claude | Bấm "Thêm agent" → chọn CLI, model, folder → terminal thật trong app | **Có**: spec §1 đang ghi "GUI chỉ quan sát" |
| **M4** | Điều phối: mailbox + sổ task, phiên trưởng nhóm giao việc cho Codex/Gemini qua chế độ không tương tác, breaker | Giao một việc cho trưởng nhóm, thấy nó chia cho hai CLI kia | **Có** |
| **M5** | Kanban, handoff/compact, lịch chạy | — | **Có** |

M1 và M2 không đổi quyết định cũ nên làm ngay. Người dùng đã đồng ý M3 ngày 2026-11-11 (bỏ giới hạn "chỉ quan
sát"); M4 và M5 chưa hỏi.

### M3 chia nhỏ (bắt đầu 2026-11-11)

| Bước | Nội dung | Trạng thái |
|---|---|---|
| M3a | **Chat**: tab giao việc, mỗi cuộc trò chuyện là một session Claude Code (`claude -p … --resume`), nối tiếp được session mở từ terminal / Desktop | Xong 2026-11-11 |
| M3b | Chat cho Codex (`codex exec --json`, `codex exec resume`) và Gemini — sau khi tra điều khoản OpenAI / Google và kiểm chứng định dạng | Chưa |
| M3c | Hỏi quyền ngay trong Chat (thay cho "từ chối"): `--permission-prompt-tool` hoặc hook Claude (= P7) | Chưa |
| M3d | Xem lại toàn bộ cuộc trò chuyện của session đang nối tiếp (đọc transcript đầy đủ) | Chưa |
| M3e | Terminal thật cho agent (PTY `portable-pty` + xterm) cho việc cần TUI: `/login`, `/resume`, lệnh slash | Chưa |
| M3f | Git worktree cho từng agent; chạy song song nhiều cuộc trò chuyện | Chưa |

Claude Desktop: session tạo từ Chat mở được trong Desktop bằng `/resume` ở ô nhập, nhưng không tự hiện ở danh sách
bên trái — Desktop chỉ liệt kê session do nó tạo (chỉ mục riêng). PrimeOffice không ghi vào dữ liệu của Desktop.

### Studio (thêm 2026-11-11)

Mỗi tab trong Office là một studio — một công ty cho một mảng (Game, Video/YouTube, …) với mặt bằng, phòng ban và
thư mục project riêng; bộ skill riêng của từng studio sẽ gắn sau khi người dùng chọn. Từ M3, "Thêm agent" chạy
trong studio đang mở: agent nhận thư mục và (sau này) bộ skill của studio đó. Thêm một loại studio = một `Plan`
trong `scripts/gen-studio-layout.py`, phòng ban trong `departments.ts`, một dòng trong `src/lib/studios.ts`.

## 5. Ghi chú kỹ thuật

- Codex 0.167 (kiểm chứng 2026-11-11 trên máy này): `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl`,
  mỗi dòng `{ timestamp, ordinal, type, payload }`. Chi tiết ở `FORMATS.md`.
- Gemini: máy này chưa có Gemini CLI (`~/.gemini/tmp` không tồn tại); có Antigravity
  (`~/.gemini/antigravity/conversations`, định dạng protobuf/SQLite — chưa đọc).
- `claude` không có trên PATH của máy này (đang dùng bản Desktop); M3 cần cài Claude Code CLI.
