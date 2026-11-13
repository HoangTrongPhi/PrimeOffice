# Thư viện skill của PrimeOffice

Thư mục này chứa các **template skill**: mỗi template là một bộ skill dành cho một lĩnh vực (Game, Video…).
Khi bạn thêm **Boss** trong Office (Add agent → Boss → *Skill template*), PrimeOffice khởi chạy Claude Code chỉ với
bộ skill của template đã chọn. Boss giao việc cho sub-agent, và sub-agent dùng cùng bộ skill đó. Các template khác
không được nạp, nên danh sách skill không bị loãng.

Muốn đổi vị trí thư mục này: **Settings (Ctrl+,) → Thư viện skill → Đổi thư mục**. PrimeOffice tự tạo cấu trúc
bên dưới ở thư mục mới; file đã có thì không bị ghi đè.

## Cấu trúc (cố định)

```
<thư viện>/
├── HUONG_DAN.md          ← file này
├── README.md             ← bản tiếng Anh
└── templates/
    ├── game/             ← một template = một thư mục (tên: chữ thường a-z, số, dấu -)
    │   ├── TEMPLATE.md   ← tên hiển thị + mô tả (frontmatter `name`, `description`)
    │   ├── skills/       ← skill của riêng bạn: skills/<tên-skill>/SKILL.md
    │   ├── agents/       ← agent của riêng bạn: agents/<tên>.md
    │   └── repos/        ← clone repo skill bên thứ 3 vào đây
    └── video/
        └── …
```

- Template mới: tạo thư mục mới trong `templates/` (ví dụ `templates/marketing/`), mở lại Settings là PrimeOffice
  tạo đủ `skills/`, `agents/`, `repos/` và `TEMPLATE.md`.
- Template trùng tên với loại studio (`game`, `video`) được chọn sẵn khi bạn thêm Boss trong studio đó.
- Thư mục khác tên `skills/`, `agents/`, `repos/` trong một template bị bỏ qua.

## Thêm skill bên thứ 3 (clone repo)

Mở terminal tại thư mục `repos/` của template rồi clone:

```powershell
cd "<thư viện>\templates\game\repos"
git clone https://github.com/<chủ-repo>/<tên-repo>.git
```

Cập nhật về sau:

```powershell
cd "<thư viện>\templates\game\repos\<tên-repo>"
git pull
```

PrimeOffice nhận ba kiểu repo, mỗi repo nằm ngay trong `repos/`:

| Kiểu repo | Nhận biết | PrimeOffice nạp bằng |
|---|---|---|
| Plugin Claude Code | có `.claude-plugin/plugin.json` hoặc thư mục `skills/` ở gốc | `--plugin-dir <repo>` (skill, agent, command của plugin) |
| Marketplace nhiều plugin | có `plugins/<tên>/` chứa plugin | `--plugin-dir` cho từng plugin con |
| Project Claude Code | có `.claude/skills/` hoặc `.claude/agents/` (ví dụ UEHF_Studio) | `--add-dir <repo>` (skill và agent trong `.claude/`) |

Repo không thuộc kiểu nào ở trên sẽ có cảnh báo trong Settings và không được nạp.

Skill của plugin hiện với tiền tố tên plugin, ví dụ `ue-skills:ue-gameplay-abilities`. Tên plugin lấy từ
`plugin.json`, không có thì lấy tên thư mục. Skill và agent của project hiện đúng tên gốc, không có tiền tố.

## Chỉ dùng skill của template

Bật **Chỉ dùng skill của template** trong Settings: PrimeOffice thêm `--setting-sources project,local`, nên
skill và plugin cá nhân (`~/.claude/skills`, plugin cài ở cấp user) không được nạp. Thiết lập cá nhân trong
`~/.claude/settings.json` (quyền, model mặc định, hook) cũng bị bỏ qua cho phiên đó. Skill trong `.claude/` của
chính project vẫn được nạp, vì đó là project của bạn. Skill đi kèm tài khoản claude.ai cũng bị ẩn. Chỉ còn các
skill có sẵn trong Claude Code (như `code-review`, `init`, `simplify`), những skill này không tắt riêng được.

## Lưu ý

- Chỉ clone repo bạn tin tưởng: skill và hook của plugin chạy với quyền của Claude Code.
- Đường dẫn thư viện không được chứa ký tự `" % ! ^ & | < >`.
- Gỡ cài đặt PrimeOffice chỉ xoá các file nó đã cài vào (hai file hướng dẫn này). Repo bạn đã clone vẫn còn,
  nhưng nếu muốn chắc chắn thì đặt thư viện ở thư mục khác (ví dụ `Documents\PrimeOffice Skills`).
- Bộ skill được gắn vào phiên lúc khởi chạy. Khi đổi template của một Boss đang chạy, hãy đóng terminal rồi mở lại.
