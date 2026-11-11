import type { HelpBlock, HelpSection, HelpTopic } from "@abyss/ui";

/*
 * PrimeOffice's Help content (F1), Vietnamese + English. One topic per tab (topic id = TabId, so the
 * panel opens on the current tab), plus Getting started, the office layout editor, the agent
 * details panel and the command line. Labels in **bold** match the UI exactly (the UI is in
 * English): keep them in sync when a label changes in the code.
 * Source of truth is the code (components/**, stores, src-tauri/src/core, the vendored office in
 * src/office/webview), then README / docs.
 */

type Pair = [vi: string, en: string];

const p = (vi: string, en: string): HelpBlock => ({ kind: "p", text: { vi, en } });
const steps = (...items: Pair[]): HelpBlock => ({ kind: "steps", items: items.map(([vi, en]) => ({ vi, en })) });
const tips = (...items: Pair[]): HelpBlock => ({ kind: "tips", items: items.map(([vi, en]) => ({ vi, en })) });
const keys = (...items: [keys: string, vi: string, en: string][]): HelpBlock => ({ kind: "keys", items: items.map(([k, vi, en]) => ({ keys: k, label: { vi, en } })) });
const section = (vi: string, en: string, ...blocks: HelpBlock[]): HelpSection => ({ heading: { vi, en }, blocks });

/** Id of the overview topic (not a tab). */
export const START_TOPIC_ID = "getting-started";

// ---------------------------------------------------------------- getting started

const gettingStarted: HelpTopic = {
  id: START_TOPIC_ID,
  title: { vi: "Bắt đầu", en: "Getting started" },
  summary: {
    vi: "PrimeOffice là gì, cách nó tìm các session của agent, những gì nó đọc và ghi, bố cục, kéo & thả thư mục, phím tắt, giao diện và cập nhật.",
    en: "What PrimeOffice is, how it finds agent sessions, what it reads and writes, the layout, dropping folders, shortcuts, appearance and updates.",
  },
  sections: [
    section(
      "PrimeOffice là gì?",
      "What is PrimeOffice?",
      p(
        "PrimeOffice là **văn phòng pixel cho các AI coding agent** của bạn. Mỗi session Claude Code trên máy này (CLI, Desktop app hay IDE) hoạt động gần đây trở thành một nhân vật: đi tới bàn, **gõ phím** khi sửa file hay chạy lệnh, **đọc** khi tìm kiếm, và hiện **bong bóng** khi cần bạn. Ngoài văn phòng còn có: **Projects** (kiểm tra một thư mục project theo chuẩn và liệt kê mọi thứ còn thiếu), **History** (các session gần nhất: prompt cuối, việc vừa làm, câu trả lời cuối) và **Agents** (agent nào có trên máy này).",
        "PrimeOffice is a **pixel office for your AI coding agents**. Every Claude Code session on this PC (CLI, Desktop app or IDE) that was active recently becomes a character: it walks to a desk, **types** while it edits files or runs commands, **reads** while it searches, and raises a **bubble** when it needs you. Around the office: **Projects** (check a project folder against the standard and list everything missing), **History** (the latest sessions: last prompt, what was just done, last reply) and **Agents** (which agents are on this PC).",
      ),
      tips(
        ["Giao diện ứng dụng bằng tiếng Anh; hướng dẫn này in **đậm** đúng tên nút / tuỳ chọn như trên màn hình.", "The app's interface is in English; this guide shows button and option names in **bold** exactly as on screen."],
        ["Mở hướng dẫn bất cứ lúc nào bằng `F1` (mở đúng chủ đề của tab đang dùng, kể cả khi đang bấm trong văn phòng), nút **?** trên header, hoặc Ctrl+K → **Help / Hướng dẫn**.", "Open this guide any time with `F1` (it opens on the tab you are in, even while the office has focus), the **?** button in the header, or Ctrl+K → **Help / Hướng dẫn**."],
      ),
    ),
    section(
      "PrimeOffice tìm session thế nào",
      "How PrimeOffice finds sessions",
      p(
        "Claude Code ghi mỗi session thành một transcript `<session>.jsonl` trong `%USERPROFILE%\\.claude\\projects\\<thư mục>\\`, với `<thư mục>` là thư mục làm việc của session sau khi đổi mọi ký tự không phải chữ, số hay `-` thành `-` (ví dụ `D:\\Game` → `D--Game`). PrimeOffice chỉ **đọc** các file này.",
        "Claude Code writes each session as a transcript `<session>.jsonl` in `%USERPROFILE%\\.claude\\projects\\<folder>\\`, where `<folder>` is the session's working directory with every character other than letters, digits and `-` turned into `-` (for example `D:\\Game` → `D--Game`). PrimeOffice only **reads** these files.",
      ),
      tips(
        ["Một tiến trình nền kiểm tra **mỗi giây** các transcript thay đổi trong khoảng **Active in** (mặc định 30 phút) và chỉ đọc các dòng mới. Session nào im lâu hơn khoảng đó thì nhân vật rời văn phòng.", "A background observer checks **every second** for transcripts that changed within the **Active in** window (30 minutes by default) and reads only the new lines. When a session stays quiet longer than that, its character leaves the office."],
        ["Văn phòng chỉ quan sát: không dùng hook, không sửa `~/.claude/settings.json`, không gửi gì lên mạng. Chỉ tab **Chat** mới chạy agent, và chỉ khi bạn gửi tin nhắn.", "The office only observes: no hooks, no change to `~/.claude/settings.json`, nothing is sent over the network. Only the **Chat** tab starts an agent, and only when you send a message."],
        ["Session Codex CLI (`~/.codex/sessions`) được đọc giống Claude và vào văn phòng. Gemini (`~/.gemini/tmp`) hiện chỉ được kiểm tra xem thư mục có tồn tại không — chưa vào văn phòng (xem chủ đề **Agents**).", "Codex CLI sessions (`~/.codex/sessions`) are read like Claude's and join the office. Gemini (`~/.gemini/tmp`) is only checked for existence today — it does not join the office yet (see the **Agents** topic)."],
        ["Trạng thái **chờ quyền** (permission) là **phỏng đoán** từ transcript: một tool chưa xong và im hơn 10 giây. Lệnh chạy lâu (Bash, PowerShell), subtask và tìm web không bị đoán như vậy.", "**Waiting for permission** is a **guess** from the transcript: a tool that has not finished and has been quiet for over 10 seconds. Long-running commands (Bash, PowerShell), subtasks and web lookups are never guessed as waiting."],
      ),
    ),
    section(
      "PrimeOffice đọc và ghi gì",
      "What PrimeOffice reads and writes",
      tips(
        ["**Đọc**: transcript của Claude Code (ở trên); trong thư mục project chỉ kiểm tra **file nào có mặt** (CLAUDE.md, .git, docs/SPEC.md…), không mở nội dung.", "**Reads**: Claude Code transcripts (above); in a project folder it only checks **which files exist** (CLAUDE.md, .git, docs/SPEC.md…), without reading them."],
        ["**Không bao giờ ghi** vào thư mục project hay vào file của agent.", "It **never writes** into a project folder or into an agent's own files."],
        ["**Ghi** vào `%LOCALAPPDATA%\\com.phineas.primeoffice\\`: `projects.json` (danh sách project đã mở), `layout.json` (bố cục văn phòng do trình chỉnh sửa lưu) và `office.json` (Settings của văn phòng, chỗ ngồi của agent, gán thư mục ↔ khu vực).", "**Writes** to `%LOCALAPPDATA%\\com.phineas.primeoffice\\`: `projects.json` (the projects you opened), `layout.json` (the office layout saved by the editor) and `office.json` (the office's Settings, agents' seats, folder ↔ area mapping)."],
        ["Tuỳ chọn giao diện (bộ lọc văn phòng, crew, giao diện, ngôn ngữ hướng dẫn) được nhớ trong bộ nhớ của cửa sổ ứng dụng. Dòng lệnh `--report` ghi file JSON ở đúng chỗ bạn chỉ định.", "UI preferences (office filter, crew, appearance, help language) are remembered in the app window's storage. The command line's `--report` writes a JSON file exactly where you tell it."],
      ),
    ),
    section(
      "Bố cục giao diện",
      "Layout",
      tips(
        ["**Thanh điều hướng (cột trái)**: 4 tab theo thứ tự Ctrl+1 … Ctrl+4 — **Office**, **Projects**, **History**, **Agents**. Phía dưới: **Settings** (Ctrl+,), **About & contact**, **Command palette** (Ctrl+K) và **Show log / Hide log** (có huy hiệu đếm lỗi khi log đang đóng).", "**Navigation rail (left)**: the 4 tabs, in the order of Ctrl+1 … Ctrl+4 — **Office**, **Projects**, **History**, **Agents**. At the bottom: **Settings** (Ctrl+,), **About & contact**, **Command palette** (Ctrl+K) and **Show log / Hide log** (with an error count while the log is closed)."],
        ["**Header**: `PrimeOffice / <tab>`, ô **Search actions…** (mở Command Palette), nút **?** (hướng dẫn này), nhãn phiên bản (`browser preview` khi chạy ngoài app desktop — khi đó không đọc được dữ liệu thật) và `via Abyss` khi được Abyss khởi chạy.", "**Header**: `PrimeOffice / <tab>`, the **Search actions…** box (opens the command palette), the **?** button (this guide), the version pill (`browser preview` outside the desktop app — no real data is read there) and `via Abyss` when Abyss launched it."],
        ["**Log (dưới đáy)**: nhật ký của giao diện và phần Rust (project đã kiểm tra, layout đã lưu, lỗi…). Bật / tắt bằng Ctrl+`; Ctrl+K → **Clear log** để xoá.", "**Log (bottom)**: messages from the UI and the Rust side (projects checked, layout saved, errors…). Toggle it with Ctrl+`; Ctrl+K → **Clear log** empties it."],
      ),
    ),
    section(
      "Mở thư mục project",
      "Opening project folders",
      p(
        "**Kéo & thả** một thư mục vào bất kỳ đâu trên cửa sổ, hoặc dùng **Open folder…** / Ctrl+O / Ctrl+K → **Open project folder…**. Thư mục được thêm vào danh sách **Projects**, được kiểm tra, rồi tuỳ tab đang mở:",
        "**Drag & drop** a folder anywhere on the window, or use **Open folder…** / Ctrl+O / Ctrl+K → **Open project folder…**. The folder is added to the **Projects** list and checked, then, depending on the tab you are in:",
      ),
      tips(
        ["**Office**: nếu project **Ready** thì văn phòng lọc theo project đó; nếu chưa thì chuyển sang **Projects** để bạn xem còn thiếu gì.", "**Office**: if the project is **Ready**, the office filters to it; if not, you are taken to **Projects** to see what is missing."],
        ["**Projects**: project được chọn và báo cáo hiện ra.", "**Projects**: the project is selected and its report shown."],
        ["**History**: History lọc theo project đó.", "**History**: History filters to that project."],
        ["**Agents**: chuyển sang **Projects** để xem báo cáo của project đó.", "**Agents**: you are taken to **Projects** to see that project's report."],
        ["Chỉ thư mục đầu tiên được dùng nếu bạn thả nhiều mục cùng lúc. Thả file (không phải thư mục) thì việc kiểm tra báo **Folder exists and can be read** không đạt.", "Only the first item is used when you drop several. Dropping a file (not a folder) fails the **Folder exists and can be read** check."],
      ),
    ),
    section(
      "Phím tắt",
      "Shortcuts",
      keys(
        ["F1", "Mở / đóng hướng dẫn này (đúng chủ đề của tab đang mở)", "Open / close this guide (on the current tab's topic)"],
        ["Ctrl+K", "Command Palette: chuyển tab, mở thư mục, chạy lại, cập nhật, log, cài đặt…", "Command palette: tabs, open a folder, run again, updates, log, settings…"],
        ["Ctrl+1 … Ctrl+5", "Chuyển tab (Office, Chat, Projects, History, Agents)", "Switch tab (Office, Chat, Projects, History, Agents)"],
        ["Ctrl+O", "Mở thư mục project (như khi thả vào tab đang mở)", "Open a project folder (as if dropped on the current tab)"],
        ["F5", "Chạy lại tab hiện tại: Office làm mới danh sách agent, Projects kiểm tra lại project đang chọn, History tải lại, Agents dò lại. Không bao giờ ghi file", "Run the current tab again: Office refreshes the agent list, Projects re-checks the selected project, History reloads, Agents detects again. Never writes anything"],
        ["Ctrl+`", "Hiện / ẩn log", "Show / hide the log"],
        ["Ctrl+,", "Settings (giao diện)", "Settings (appearance)"],
        ["Esc", "Đóng hộp thoại / Command Palette / hướng dẫn", "Close a dialog / the command palette / this guide"],
      ),
      tips(["Khi bạn vừa bấm vào văn phòng, phím được gửi tới văn phòng: chỉ `F1` được chuyển ra ngoài. Bấm vào header hoặc danh sách bên phải trước khi dùng Ctrl+K, Ctrl+1…5 hay F5. Phím của trình chỉnh sửa layout nằm trong chủ đề **Office — layout editor**.", "Right after you click in the office, keys go to the office: only `F1` is passed on. Click the header or the list on the right before using Ctrl+K, Ctrl+1…5 or F5. The layout editor's keys are in the **Office — layout editor** topic."]),
    ),
    section(
      "Giao diện và cập nhật",
      "Appearance and updates",
      tips(
        ["**Settings** (Ctrl+,): chủ đề sáng / tối / theo Windows, font giao diện và font code, cỡ giao diện, mức hiệu ứng. Không ảnh hưởng tới phần văn phòng pixel (văn phòng có **Settings** riêng, xem chủ đề **Office**).", "**Settings** (Ctrl+,): light / dark / Windows theme, UI and code fonts, UI scale, effects level. It does not change the pixel office (the office has its own **Settings**, see the **Office** topic)."],
        ["Ctrl+K → **Check for updates…** (hoặc trong **About & contact**). Bản phát hành tự kiểm tra một lần lúc khởi động. Khi có bản mới, header hiện nút **Update to vX.Y.Z** để tải, cài và khởi động lại.", "Ctrl+K → **Check for updates…** (or in **About & contact**). Release builds also check once at startup. When a new version exists, the header shows **Update to vX.Y.Z** to download, install and restart."],
        ["Khi được Abyss khởi chạy, PrimeOffice không tự kiểm tra cập nhật: Abyss báo và cài bản mới khi ứng dụng đóng.", "When Abyss launches PrimeOffice, it does not check by itself: Abyss shows the update and installs it when the app closes."],
      ),
    ),
  ],
};

// ---------------------------------------------------------------- Office

const office: HelpTopic = {
  id: "office",
  title: { vi: "Office — văn phòng pixel", en: "Office — the pixel office" },
  summary: {
    vi: "Mỗi session agent đang hoạt động là một nhân vật: gõ khi sửa, đọc khi tìm, bong bóng khi cần bạn. Lọc theo project và thời gian, chọn crew, bấm nhân vật để xem chi tiết.",
    en: "Every active agent session is a character: it types while editing, reads while searching, raises a bubble when it needs you. Filter by project and time, pick the crew, click a character for details.",
  },
  sections: [
    section(
      "Bắt đầu nhanh",
      "Quick start",
      steps(
        ["Chạy Claude Code như thường lệ (terminal, Desktop app hoặc IDE). Trong vòng một giây sau khi transcript thay đổi, nhân vật của session đó bước vào văn phòng.", "Use Claude Code as usual (terminal, Desktop app or IDE). Within a second of its transcript changing, the session's character walks into the office."],
        ["Xem nhãn trên đầu nhân vật: việc đang làm (`Editing App.tsx`, `Running: npm test`, `Searching code`…) và tên thư mục.", "Read the label above the character: what it is doing (`Editing App.tsx`, `Running: npm test`, `Searching code`…) and the folder name."],
        ["Bấm vào một nhân vật (hoặc một dòng trong danh sách bên phải) để xem prompt cuối, các việc vừa làm và câu trả lời cuối — xem chủ đề **Agent details**.", "Click a character (or a row in the list on the right) to see its last prompt, recent actions and last reply — see the **Agent details** topic."],
      ),
    ),
    section(
      "Thanh công cụ phía trên",
      "Top toolbar",
      tips(
        ["**Project**: **All projects** hoặc một project. Chỉ những project **Ready** trong tab Projects mới có trong danh sách.", "**Project**: **All projects** or one project. Only projects that are **Ready** in the Projects tab are listed."],
        ["**Open folder…**: mở một thư mục project; nếu nó Ready thì văn phòng lọc theo nó, nếu không thì chuyển sang Projects.", "**Open folder…**: opens a project folder; if it is Ready the office filters to it, otherwise you go to Projects."],
        ["**Active in**: `15 min`, `30 min`, `1 h`, `4 h`, `24 h` — session có transcript thay đổi trong khoảng này thì có mặt; im lâu hơn thì nhân vật rời đi. Khoảng này cũng quyết định nhãn **Idle** trong History.", "**Active in**: `15 min`, `30 min`, `1 h`, `4 h`, `24 h` — sessions whose transcript changed within this window are in the office; quieter ones leave. The same window decides the **Idle** status in History."],
        ["**Crew**: **PrimeOffice crew** (8 nhân vật do ứng dụng tự vẽ) hoặc **Classic (pixel-agents)**. Đổi crew sẽ tải lại văn phòng.", "**Crew**: **PrimeOffice crew** (8 characters drawn by the app's own generator) or **Classic (pixel-agents)**. Switching crew reloads the office."],
        ["Nhãn **N agents** đếm số nhân vật; nút mũi tên (**Agent list**) ẩn / hiện cột bên phải. Project, Active in và Crew được nhớ cho lần mở sau.", "The **N agents** pill counts the characters; the arrow button (**Agent list**) hides / shows the right column. Project, Active in and Crew are remembered for next time."],
      ),
    ),
    section(
      "Nhân vật, nhãn và bong bóng",
      "Characters, labels and bubbles",
      tips(
        ["**Gõ phím**: sửa / ghi file, chạy lệnh, các tool khác. **Đọc**: `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`.", "**Typing**: editing / writing files, running commands, other tools. **Reading**: `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`."],
        ["**Dấu tích xanh**: lượt (turn) đã xong, agent chờ prompt tiếp theo.", "**Green check**: the turn is done; the agent waits for your next prompt."],
        ["Nhãn **Waiting for input**: agent đang hỏi bạn (`AskUserQuestion`) hoặc chờ duyệt kế hoạch (`ExitPlanMode`).", "**Waiting for input** label: the agent asked you something (`AskUserQuestion`) or waits for plan approval (`ExitPlanMode`)."],
        ["Bong bóng **…**: có lẽ đang chờ bạn cấp quyền (phỏng đoán: một tool im hơn 10 giây). Hãy xem cửa sổ Claude Code để chắc chắn.", "**…** bubble: most likely waiting for your permission (a guess: a tool quiet for more than 10 seconds). Check the Claude Code window to be sure."],
        ["Thanh nhỏ dưới nhãn là mức **context** đã dùng; rê chuột để xem số token.", "The small bar under the label is the **context** used; hover it for the token count."],
        ["Subtask (`Task` / `Agent`) hiện thành nhãn `Subtask: …` của chính agent đó, chưa thành nhân vật riêng.", "Subtasks (`Task` / `Agent`) show as a `Subtask: …` label on the agent itself, not as separate characters yet."],
      ),
    ),
    section(
      "Thao tác trong văn phòng",
      "Moving around the office",
      tips(
        ["Bấm một nhân vật để chọn: camera đi theo nó và chi tiết hiện ở cột phải. Bấm lại nhân vật đó hoặc bấm sàn trống để bỏ chọn.", "Click a character to select it: the camera follows it and its details open on the right. Click it again or click empty floor to deselect."],
        ["Đang chọn một nhân vật, bấm vào một **ghế trống** để chuyển nó sang đó; bấm ghế của chính nó để gọi nó về chỗ. Chỗ ngồi được nhớ theo từng session, kể cả khi đổi Crew hay mở lại ứng dụng.", "With a character selected, click a **free seat** to move it there; click its own seat to send it back. Seats are remembered per session, across crew switches and app restarts."],
        ["Lăn chuột / vuốt hai ngón: di chuyển khung nhìn. Ctrl+lăn chuột hoặc nút **+ / −** ở góc trên trái: phóng to / thu nhỏ. Kéo chuột giữa: di chuyển.", "Mouse wheel / two-finger scroll: pan. Ctrl+wheel or the **+ / −** buttons at the top left: zoom. Middle-button drag: pan."],
        ["Cột thẻ nhỏ ở mép phải văn phòng: mỗi agent một thẻ (ảnh + chấm trạng thái); bấm để chọn và đi theo.", "The column of small cards on the office's right edge: one card per agent (portrait + status dot); click to select and follow."],
        ["Nút **×** (**Close agent**) cho nhân vật rời văn phòng nhưng **không dừng** agent (PrimeOffice chỉ quan sát): nó quay lại, về đúng chỗ cũ, ngay khi session có hoạt động mới. Nhân vật cũng tự rời đi khi session im lâu hơn **Active in**.", "The **×** (**Close agent**) button sends the character out of the office but **does not stop** the agent (PrimeOffice only observes): it walks back in, to the same seat, as soon as its session does something new. A character also leaves by itself once its session is quiet for longer than **Active in**."],
      ),
    ),
    section(
      "Thanh dưới của văn phòng",
      "The office's bottom bar",
      tips(
        ["**Layout**: bật trình chỉnh sửa bố cục — xem chủ đề **Office — layout editor**.", "**Layout**: turns on the layout editor — see the **Office — layout editor** topic."],
        ["**Settings** (của văn phòng): **Sound Notifications** (âm báo khi agent xong / cần bạn), **Always Show Labels** (luôn hiện nhãn trên đầu), **Show Areas** (chỉ có khi dùng được Areas), **Debug View** (danh sách trạng thái thô thay cho văn phòng).", "**Settings** (the office's own): **Sound Notifications** (a chime when an agent finishes / needs you), **Always Show Labels** (labels above every character), **Show Areas** (only when Areas are available), **Debug View** (a raw status list instead of the office)."],
        ["**Sound Notifications**, **Always Show Labels** và **Show Areas** được lưu (`office.json`) và giữ nguyên khi đổi Crew hay mở lại ứng dụng. Mặc định: âm báo tắt, nhãn luôn hiện, không hiện khu vực.", "**Sound Notifications**, **Always Show Labels** and **Show Areas** are saved (`office.json`) and survive crew switches and app restarts. Defaults: sound off, labels always shown, areas hidden."],
      ),
    ),
    section(
      "Studio — mỗi tab một công ty",
      "Studios — one company per tab",
      tips(
        ["Dải tab trên cùng của Office là các **studio**. Mỗi studio là một công ty riêng: mặt bằng riêng, phòng ban riêng và các thư mục project của riêng nó. Bấm tab để chuyển; văn phòng nạp lại mặt bằng của studio đó.", "The tab strip on top of Office holds the **studios**. Each studio is a company of its own: its floor, its departments and its project folders. Click a tab to switch; the office reloads that studio's floor."],
        ["**+** tạo studio mới từ một loại: **Game studio**, **Video studio** (YouTube / sản xuất video: Ban sản xuất, Phòng họp, Publishing & SEO, Script room, Studio head, Editing bay, Motion & graphics, Lounge, Audio booth, Analytics) hoặc **Classic office**. Tối đa 12 studio.", "**+** creates a studio from a kind: **Game studio**, **Video studio** (YouTube / video production: Ban sản xuất, meeting room, Publishing & SEO, Script room, Studio head, Editing bay, Motion & graphics, Lounge, Audio booth, Analytics) or **Classic office**. At most 12 studios."],
        ["**Studio…** (bên phải dải tab): đổi tên, tick các **thư mục** thuộc studio (agent chạy trong các thư mục đó mới hiện ở đây; không tick gì = hiện mọi project), hoặc xoá studio cùng mặt bằng của nó. Thư mục phải được mở trước bằng **Open folder…** hoặc tab Projects.", "**Studio…** (right of the strip): rename it, tick the **folders** that belong to it (only agents working in those folders appear here; none ticked = every project), or delete the studio and its floor. A folder must be opened first with **Open folder…** or the Projects tab."],
        ["Trong Video studio, agent con ngồi theo loại: `scriptwriter` → Script room, `video-editor` → Editing bay, `thumbnail-designer` → Motion & graphics, `voice-over-artist` → Audio booth, `seo-specialist` → Publishing & SEO, `retention-analyst` → Analytics, `showrunner` → Ban sản xuất. Đây là tên tạm cho tới khi bộ skill của studio được chọn.", "In a Video studio sub-agents sit by type: `scriptwriter` → Script room, `video-editor` → Editing bay, `thumbnail-designer` → Motion & graphics, `voice-over-artist` → Audio booth, `seo-specialist` → Publishing & SEO, `retention-analyst` → Analytics, `showrunner` → Ban sản xuất. These names are placeholders until the studio's skill set is chosen."],
        ["Danh sách studio lưu ở `studios.json`; mặt bằng của từng studio ở `layout.json` (studio đầu tiên) và `layout-<id>.json`.", "The studio list is saved in `studios.json`; each studio's floor in `layout.json` (the first studio) and `layout-<id>.json`."],
      ),
    ),
    section(
      "Mặt bằng studio và phòng ban",
      "Studio floor plan and departments",
      tips(
        ["**Floor plan…** (thanh trên) nạp **Game studio**: Ban giám đốc, Phòng họp, Release & ops, Design, Studio head, Engineering, Narrative, Art, Audio, Engine lab, Loc & community, Lounge, QA — theo studio của Claude Code Game Studios (UEHF_Studio và các game của nó). **Video studio** và **Classic office** cũng nạp được ở đây. Nạp mặt bằng sẽ thay bố cục của studio đang mở.", "**Floor plan…** (top bar) loads **Game studio**: Directors (Ban giám đốc), Meeting room (Phòng họp), Release & ops, Design, Studio head, Engineering, Narrative, Art, Audio, Engine lab, Loc & community, Lounge, QA — the studio of Claude Code Game Studios (UEHF_Studio and its games). **Video studio** and **Classic office** load here too. Loading a floor plan replaces the layout of the studio on screen."],
        ["Mỗi agent con (`Agent` / `Task`) là một nhân vật riêng: xuất hiện cạnh session gọi nó rồi **đi về bàn trong phòng ban của mình** theo loại agent (`gameplay-programmer` → Engineering, `ue-gas-specialist` → Engine lab, `qa-tester` → QA …). Nhãn trên đầu: loại agent · việc được giao; chọn nhân vật để thấy tool đang chạy.", "Every sub-agent (`Agent` / `Task`) is its own character: it appears beside the session that started it, then **walks to a desk in its department** by agent type (`gameplay-programmer` → Engineering, `ue-gas-specialist` → Engine lab, `qa-tester` → QA …). Its label: agent type · task; select it to see the tool it is running."],
        ["Session chính ngồi ở **Studio head**; **xong lượt** thì ra **Lounge** nghỉ, có việc mới hoặc cần hỏi bạn thì quay về bàn. Agent không thuộc phòng nào (`general-purpose`, `Explore`) đứng cạnh session đã gọi nó.", "Main sessions sit at **Studio head**; when their **turn is done** they rest in the **Lounge** and come back to their desk for new work or a question for you. Agents without a department (`general-purpose`, `Explore`) stand by the session that started them."],
        ["**Phòng họp**: khi từ 2 giám đốc (creative-director, technical-director, producer) cùng làm việc — như một director gate — họ sang phòng họp, xong ai về bàn nấy. **Editor desk** (trong Engine lab): agent gọi editor qua MCP (`mcp__unreal-mcp__call_tool` …) sang ngồi đó, **mỗi lúc một người** như Unreal MCP; người sau chờ ở bàn mình rồi vào khi bàn trống. Phòng ban hết bàn thì agent đứng trong phòng.", "**Meeting room**: when 2 or more directors (creative-director, technical-director, producer) work at once — a director gate — they move to the meeting room and go back to their desks as they finish. **Editor desk** (in Engine lab): an agent calling the editor through MCP (`mcp__unreal-mcp__call_tool` …) sits there, **one at a time** like Unreal MCP; the next one waits at its own desk and takes the desk when it is free. A department with no free desk: the agent stands in the room."],
        ["Phòng ban được nhận theo **tên khu vực (Areas)**, không phân biệt hoa thường và dấu: một khu tên `Engineering`, `QA`, `Phòng QA`, `Engine lab`, `Unreal lab` … trong bố cục của riêng bạn cũng dùng được. Khu đặt đúng tên một agent (vd. `writer`) là bàn riêng của agent đó.", "Departments are found by **Area name**, ignoring case and accents: an Area named `Engineering`, `QA`, `Phòng QA`, `Engine lab`, `Unreal lab` … in your own layout works too. An Area named after one agent (e.g. `writer`) is that agent's own desk."],
      ),
    ),
    section(
      "Cột bên phải",
      "The right column",
      tips(
        ["Mỗi dòng: tiêu đề session (hoặc tên thư mục), trạng thái, việc đang làm hoặc việc cuối cùng, thư mục · thời gian. Danh sách tự làm mới mỗi 2 giây; F5 làm mới ngay.", "Each row: the session title (or folder name), status, what it is doing or did last, folder · time. The list refreshes every 2 seconds; F5 refreshes it at once."],
        ["Trạng thái: **Working** (đang chạy), **Needs you** (đang hỏi / chờ quyền), **Turn done** (xong lượt), **Idle** (im quá khoảng Active in).", "Statuses: **Working** (running), **Needs you** (asking / waiting for permission), **Turn done** (turn finished), **Idle** (quiet longer than Active in)."],
        ["Bấm một dòng để xem chi tiết; **Back to the list** để quay lại.", "Click a row for its details; **Back to the list** returns."],
      ),
    ),
    section(
      "Văn phòng trống?",
      "Empty office?",
      tips(
        ["Thông báo **The office is quiet** nghĩa là không session nào thay đổi trong khoảng **Active in** (và trong project đã chọn). Thử khoảng dài hơn hoặc **All projects**.", "**The office is quiet** means no session changed within **Active in** (and in the selected project). Try a longer window or **All projects**."],
        ["Mở tab **Agents**: Claude Code phải là **Active** hoặc **Found**. **Not found** nghĩa là `~/.claude/projects` chưa tồn tại — chạy `claude` một lần.", "Open the **Agents** tab: Claude Code should be **Active** or **Found**. **Not found** means `~/.claude/projects` does not exist yet — run `claude` once."],
        ["Lọc theo project chỉ khớp đúng thư mục làm việc của session: session chạy ở thư mục cha hay thư mục con không được tính.", "The project filter matches the session's exact working directory: sessions started in a parent or a subfolder do not count."],
      ),
    ),
  ],
};

// ---------------------------------------------------------------- Office layout editor

const officeLayout: HelpTopic = {
  id: "office-layout",
  title: { vi: "Office — chỉnh bố cục", en: "Office — layout editor" },
  summary: {
    vi: "Nút Layout trong văn phòng: đặt nội thất, sơn sàn, tường, thảm, vẽ khu vực theo thư mục, tẩy ô; Undo / Redo / Save / Reset. Layout tự lưu vào layout.json.",
    en: "The office's Layout button: place furniture, paint floors, walls and carpets, draw folder areas, erase tiles; Undo / Redo / Save / Reset. The layout saves itself to layout.json.",
  },
  sections: [
    section(
      "Bật / tắt trình chỉnh sửa",
      "Turning the editor on / off",
      steps(
        ["Bấm **Layout** ở thanh dưới của văn phòng (nút sáng lên khi đang chỉnh).", "Click **Layout** in the office's bottom bar (it lights up while editing)."],
        ["Chọn công cụ ở hàng nút: **Furniture**, **Floor**, **Walls**, **Pets**, **Areas** (khi có), **Erase**. Bấm lại công cụ đang bật để về chế độ chọn.", "Pick a tool in the button row: **Furniture**, **Floor**, **Walls**, **Pets**, **Areas** (when available), **Erase**. Click the active tool again to go back to selecting."],
        ["Bấm **Layout** lần nữa (hoặc `Esc` nhiều lần) để thoát.", "Click **Layout** again (or press `Esc` a few times) to leave."],
      ),
    ),
    section(
      "Các công cụ",
      "Tools",
      tips(
        ["**Furniture**: chọn nhóm (**Desks**, **Chairs**, **Storage**, **Tech**, **Decor**, **Wall**, **Misc**), chọn món, bấm lên sàn để đặt. **Copy** lấy loại nội thất từ một món đã đặt. Màu cho món mới chỉnh ở bảng màu phía trên.", "**Furniture**: pick a group (**Desks**, **Chairs**, **Storage**, **Tech**, **Decor**, **Wall**, **Misc**), pick an item, click the floor to place it. **Copy** takes the type of an item already placed. The colour for new items is set in the colour panel above."],
        ["Chọn một món đã đặt (bấm vào nó): kéo để di chuyển (giữ Alt khi bắt đầu kéo để kéo ra một bản sao), nút xoay / xoá cạnh món đó, bảng màu để đổi màu (**Reset** về màu gốc).", "Select a placed item (click it): drag to move it (hold Alt as you start dragging to drag out a copy), use the rotate / delete buttons next to it, and the colour panel to recolour it (**Reset** restores the original)."],
        ["**Carpet** (trong Furniture): sơn thảm; chọn kiểu thảm, màu và màu **Accent**; **Copy** (`P`) lấy kiểu + màu từ ô có sẵn.", "**Carpet** (inside Furniture): paint carpets; pick a carpet style, colour and **Accent** colour; **Copy** (`P`) takes style + colours from an existing tile."],
        ["**Floor**: chọn mẫu sàn rồi bấm / kéo để sơn; **Color** mở chỉnh màu và **Contrast**; **Copy** lấy mẫu + màu từ một ô có sẵn.", "**Floor**: pick a floor pattern, then click / drag to paint; **Color** opens colour and **Contrast**; **Copy** takes pattern + colour from an existing tile."],
        ["**Walls**: bấm / kéo để thêm hoặc bỏ tường; chọn bộ tường và màu.", "**Walls**: click / drag to add or remove walls; pick a wall set and colour."],
        ["**Erase**: biến ô thành khoảng trống (ngoài phòng). Trong Floor, Walls, Carpet, Areas và Erase, **chuột phải** cũng tẩy.", "**Erase**: turns tiles into void (outside the room). In Floor, Walls, Carpet, Areas and Erase, the **right mouse button** erases too."],
        ["**Pets**: PrimeOffice chưa kèm thú cưng nào nên bảng này trống.", "**Pets**: PrimeOffice ships no pets yet, so this panel is empty."],
      ),
    ),
    section(
      "Khu vực theo thư mục (Areas)",
      "Folder areas (Areas)",
      p(
        "**Areas** cho phép dành một vùng của văn phòng cho một thư mục: agent của thư mục đó sẽ ngồi trong vùng ấy. Nút **Areas** chỉ hiện khi layout đã có khu vực hoặc văn phòng đã thấy ít nhất một agent (thư mục của nó có thể gán).",
        "**Areas** reserve part of the office for a folder: that folder's agents sit inside it. The **Areas** button only shows when the layout already has areas or the office has seen at least one agent (its folder can be mapped).",
      ),
      steps(
        ["Gõ tên vào **Area name…**, chọn màu, bấm **Add**.", "Type a name in **Area name…**, pick a colour, click **Add**."],
        ["Chọn thẻ khu vực rồi sơn các ô của nó lên bản đồ (chuột phải để bỏ).", "Select the area's card, then paint its tiles on the map (right-click removes)."],
        ["Trong thẻ, **Map a folder…** gán một thư mục (tên thư mục của agent); bấm đúp tên để đổi tên, nút xoá để bỏ khu vực.", "In the card, **Map a folder…** assigns a folder (an agent's folder name); double-click the name to rename it, use the remove button to delete the area."],
      ),
      tips(["Khu vực được lưu trong layout; việc gán thư mục ↔ khu vực được lưu riêng (`office.json`), nên cả hai giữ nguyên khi đổi Crew hay mở lại ứng dụng.", "Areas are saved with the layout; the folder ↔ area mapping is saved on its own (`office.json`), so both survive crew switches and app restarts."]),
    ),
    section(
      "Lưu, Undo, Reset",
      "Saving, Undo, Reset",
      tips(
        ["Mọi thay đổi được **tự lưu** khoảng nửa giây sau đó vào `%LOCALAPPDATA%\\com.phineas.primeoffice\\layout.json` (log báo `Layout saved`). Không có file đó thì văn phòng dùng bố cục mặc định.", "Every change is **saved automatically** about half a second later to `%LOCALAPPDATA%\\com.phineas.primeoffice\\layout.json` (the log says `Layout saved`). Without that file the office uses the bundled default layout."],
        ["Khi có thay đổi, thanh trên cùng hiện **Undo** (Ctrl+Z), **Redo** (Ctrl+Y / Ctrl+Shift+Z), **Save** và **Reset**.", "Once something changed, the top bar shows **Undo** (Ctrl+Z), **Redo** (Ctrl+Y / Ctrl+Shift+Z), **Save** and **Reset**."],
        ["**Save** đánh dấu bố cục hiện tại là mốc; **Reset** → **Yes** quay về mốc đó (lần Save gần nhất, hoặc bố cục lúc văn phòng mở).", "**Save** marks the current layout as the checkpoint; **Reset** → **Yes** returns to it (the last Save, or the layout the office opened with)."],
        ["Chưa có cách xuất / nhập layout trong PrimeOffice; muốn sao lưu thì chép `layout.json`.", "PrimeOffice has no layout export / import yet; copy `layout.json` to back it up."],
      ),
    ),
    section(
      "Phím trong trình chỉnh sửa",
      "Editor keys",
      keys(
        ["R", "Xoay món đang chọn", "Rotate the selected item"],
        ["T", "Đổi trạng thái món đang chọn (ví dụ bật / tắt)", "Toggle the selected item's state (e.g. on / off)"],
        ["Delete / Backspace", "Xoá món đang chọn", "Delete the selected item"],
        ["Ctrl+Z", "Undo", "Undo"],
        ["Ctrl+Y / Ctrl+Shift+Z", "Redo", "Redo"],
        ["P", "Trong Carpet: lấy mẫu thảm từ ô có sẵn", "In Carpet: copy a carpet from an existing tile"],
        ["Esc", "Lùi từng bước: bỏ món đang cầm → đóng công cụ → bỏ chọn → thoát trình chỉnh sửa", "Steps back: drop the item in hand → close the tool → deselect → leave the editor"],
      ),
      tips(["Các phím này chỉ chạy khi văn phòng đang được focus (bấm vào văn phòng trước).", "These keys only work while the office has focus (click in the office first)."]),
    ),
  ],
};

// ---------------------------------------------------------------- Agent details (SessionView)

const session: HelpTopic = {
  id: "session",
  title: { vi: "Chi tiết agent / session", en: "Agent details" },
  summary: {
    vi: "Bảng chi tiết của một session (Office và History): trạng thái, model, context, prompt cuối, việc đang chạy, các việc gần đây, câu trả lời cuối.",
    en: "The details of one session (Office and History): status, model, context, last prompt, what is running, recent actions, last reply.",
  },
  sections: [
    section(
      "Mở ở đâu",
      "Where it opens",
      tips(
        ["**Office**: bấm một nhân vật hoặc một dòng ở cột phải (15 việc gần nhất).", "**Office**: click a character or a row in the right column (last 15 actions)."],
        ["**History**: chọn một session ở danh sách bên trái (50 việc gần nhất).", "**History**: pick a session in the left list (last 50 actions)."],
      ),
    ),
    section(
      "Đọc bảng chi tiết",
      "Reading the panel",
      tips(
        ["**Tiêu đề**: tiêu đề đặt trong Claude Code (custom title / agent name) hoặc bản tóm tắt; không có thì là đầu prompt đầu tiên; trống thì `Untitled session`.", "**Title**: the title set in Claude Code (custom title / agent name) or its summary; otherwise the start of the first prompt; `Untitled session` when empty."],
        ["Dòng thông tin: agent (`Claude Code`), nơi chạy (`cli`, `Desktop app`…), model, thời gian hoạt động cuối, số prompt; dưới đó là thư mục làm việc.", "Info line: agent (`Claude Code`), where it runs (`cli`, `Desktop app`…), model, last activity, prompt count; below it, the working folder."],
        ["**Context N%**: phần context đã dùng (trên 200k token, hoặc 1M với model `[1m]`); xanh < 60%, vàng tới 85%, đỏ trên 85%. Rê chuột để xem số token.", "**Context N%**: context used (out of 200k tokens, or 1M for `[1m]` models); green below 60%, amber up to 85%, red above. Hover for the token count."],
        ["**Last prompt**: prompt gần nhất của bạn (lệnh như `/init` hiện đúng tên lệnh), tối đa 500 ký tự.", "**Last prompt**: your latest prompt (commands such as `/init` show as the command), up to 500 characters."],
        ["**Running now**: các tool đã bắt đầu mà chưa xong.", "**Running now**: tools that started and have not finished."],
        ["**Recent actions**: mới nhất ở trên, kèm giờ: đọc, sửa, chạy lệnh, tìm kiếm, web, subtask, hỏi bạn, lập kế hoạch, skill…", "**Recent actions**: newest first, with the time: reads, edits, commands, searches, web, subtasks, questions, planning, skills…"],
        ["**Last reply**: đoạn văn bản cuối agent trả lời, tối đa 500 ký tự.", "**Last reply**: the agent's last text answer, up to 500 characters."],
      ),
    ),
    section(
      "Trạng thái được suy ra thế nào",
      "How the status is worked out",
      tips(
        ["**Working**: lượt đang chạy.", "**Working**: the turn is running."],
        ["**Needs you**: agent hỏi bạn / chờ duyệt kế hoạch, hoặc một tool im hơn 10 giây (đoán là chờ quyền).", "**Needs you**: it asked you / waits for plan approval, or a tool has been quiet for over 10 seconds (guessed as a permission prompt)."],
        ["**Turn done**: lượt đã kết thúc, hoặc câu trả lời cuối là văn bản và đã im hơn 5 giây.", "**Turn done**: the turn ended, or the last record is a text reply and it has been quiet for over 5 seconds."],
        ["**Idle**: transcript không đổi trong khoảng **Active in** của Office.", "**Idle**: the transcript has not changed within the Office's **Active in** window."],
      ),
    ),
    section(
      "Mẹo",
      "Tips",
      tips(
        ["Có thể bôi đen và sao chép nội dung **Last prompt** / **Last reply**.", "You can select and copy the **Last prompt** / **Last reply** text."],
        ["Tóm tắt là cơ học (từ tool và prompt), không gọi LLM nào.", "The summary is mechanical (from tools and prompts); no LLM is called."],
        ["Transcript rất dài chỉ được đọc phần đầu (256 KB) và phần cuối (4 MB), nên số prompt có thể thiếu.", "Very long transcripts are read head (256 KB) and tail (4 MB) only, so the prompt count can be partial."],
      ),
    ),
  ],
};

// ---------------------------------------------------------------- Projects

const projects: HelpTopic = {
  id: "projects",
  title: { vi: "Projects — kiểm tra project", en: "Projects — project check" },
  summary: {
    vi: "Mở một thư mục, kiểm tra theo chuẩn project (agent session, CLAUDE.md, git, docs/SPEC.md, docs/PROGRESS.md…) và xem cách sửa từng mục còn thiếu.",
    en: "Open a folder, check it against the project standard (agent sessions, CLAUDE.md, git, docs/SPEC.md, docs/PROGRESS.md…) and see how to fix every missing item.",
  },
  sections: [
    section(
      "Cách dùng",
      "How to use it",
      steps(
        ["Bấm **Open folder…** (hoặc Ctrl+O, hoặc thả thư mục vào cửa sổ).", "Click **Open folder…** (or Ctrl+O, or drop a folder on the window)."],
        ["Project vào đầu danh sách bên trái — chấm xanh là **Ready**, chấm đỏ là **not ready** — và báo cáo hiện bên phải.", "The project goes to the top of the left list — green dot **Ready**, red dot **not ready** — and its report shows on the right."],
        ["Sửa các mục chưa đạt (mỗi mục có dòng **Fix:** và nút sao chép), rồi bấm nút làm mới (**Check again**, F5).", "Fix the failed items (each has a **Fix:** line with a copy button), then click the refresh button (**Check again**, F5)."],
        ["Khi project **Ready**: **View in office** chỉ hiện agent của project này; **History** mở lịch sử của nó.", "Once it is **Ready**: **View in office** shows only this project's agents; **History** opens its history."],
      ),
    ),
    section(
      "Báo cáo",
      "The report",
      tips(
        ["Nhãn **Ready** hoặc **Not ready — N required missing**, đường dẫn, số session theo agent và lần cuối.", "The **Ready** or **Not ready — N required missing** pill, the path, session counts per agent and the last one."],
        ["Khung màu liệt kê nhanh những gì còn thiếu; **Project standard — X/Y passed** liệt kê mọi mục, mục chưa đạt ở trên, kèm mã (`agent.sessions`…).", "The coloured banner lists what is missing at a glance; **Project standard — X/Y passed** lists every item, failed ones first, with its code (`agent.sessions`…)."],
        ["Mức: **required** (bắt buộc — thiếu thì chưa xem được), **recommended** (nên có), **optional** (tuỳ chọn).", "Levels: **required** (missing means it cannot be viewed yet), **recommended**, **optional**."],
        ["Nút thùng rác **Remove from the list** chỉ bỏ khỏi danh sách — thư mục không bị đụng tới. Nút thư mục mở nó trong Explorer.", "The bin button **Remove from the list** only removes it from the list — the folder is not touched. The folder button shows it in Explorer."],
      ),
    ),
    section(
      "Các mục kiểm tra và cách sửa",
      "Checks and how to fix them",
      tips(
        ["**Folder exists and can be read** (required, `folder.exists`): thư mục đã bị chuyển, đổi tên hoặc ở ổ đĩa đang thiếu. Chọn lại thư mục, và bỏ mục cũ khỏi danh sách.", "**Folder exists and can be read** (required, `folder.exists`): the folder was moved, renamed or is on a missing drive. Open it again and remove the old entry."],
        ["**Agent sessions for this folder** (required, `agent.sessions`): chưa agent nào chạy **đúng** trong thư mục này. Mở terminal tại đó và chạy `claude` một lần (hoặc mở thư mục này trong Claude Desktop / IDE), rồi kiểm tra lại. Session chạy ở thư mục cha không được tính.", "**Agent sessions for this folder** (required, `agent.sessions`): no agent has run in **this exact** folder yet. Open a terminal there and run `claude` once (or open this folder in Claude Desktop / your IDE), then check again. Sessions started in a parent folder do not count."],
        ["**Agent instructions (CLAUDE.md or AGENTS.md)** (recommended, `agent.instructions`): chạy `/init` trong Claude Code ở thư mục này, hoặc tự viết `CLAUDE.md`. `AGENTS.md` và `.claude/CLAUDE.md` cũng được tính.", "**Agent instructions (CLAUDE.md or AGENTS.md)** (recommended, `agent.instructions`): run `/init` in Claude Code in this folder, or write `CLAUDE.md` yourself. `AGENTS.md` and `.claude/CLAUDE.md` count too."],
        ["**Git repository** (recommended, `vcs.git`): chạy `git init` trong thư mục.", "**Git repository** (recommended, `vcs.git`): run `git init` in the folder."],
        ["**Spec (docs/SPEC.md)** (recommended, `abyss.spec`): viết `docs/SPEC.md` — mục tiêu, luồng chính, kiến trúc (theo Abyss `docs/app-specs/00_SHARED_FRAMEWORK.md` §3).", "**Spec (docs/SPEC.md)** (recommended, `abyss.spec`): write `docs/SPEC.md` — goals, main flows, architecture (per Abyss `docs/app-specs/00_SHARED_FRAMEWORK.md` §3)."],
        ["**Progress log (docs/PROGRESS.md)** (recommended, `abyss.progress`): thêm `docs/PROGRESS.md` — trạng thái, các phase, quyết định (mẫu ở §15 của khung chung).", "**Progress log (docs/PROGRESS.md)** (recommended, `abyss.progress`): add `docs/PROGRESS.md` — status, phases, decisions (template in §15 of the shared framework)."],
        ["**Project agent settings (.claude/)** (optional, `agent.settings`): tạo thư mục `.claude/` nếu cần settings, skill hay agent riêng cho project.", "**Project agent settings (.claude/)** (optional, `agent.settings`): create `.claude/` if the project needs its own settings, skills or agents."],
        ["**Changelog** (optional, `abyss.changelog`): thêm `docs/CHANGELOG.md` (hoặc `CHANGELOG.md` ở gốc).", "**Changelog** (optional, `abyss.changelog`): add `docs/CHANGELOG.md` (or `CHANGELOG.md` at the root)."],
        ["**README.md** (optional, `abyss.readme`): thêm `README.md` nói project là gì và chạy thế nào.", "**README.md** (optional, `abyss.readme`): add a `README.md` saying what the project is and how to run it."],
      ),
    ),
    section(
      "Lưu ý",
      "Notes",
      tips(
        ["PrimeOffice **không tự tạo** file nào cho bạn: nó chỉ kiểm tra file có mặt hay không. Danh sách project lưu ở `%LOCALAPPDATA%\\com.phineas.primeoffice\\projects.json`.", "PrimeOffice **never creates** these files for you: it only checks whether they exist. The project list is kept in `%LOCALAPPDATA%\\com.phineas.primeoffice\\projects.json`."],
        ["Mọi project trong danh sách được kiểm tra lại mỗi khi tab mở. Dòng phụ ở danh sách trái đếm mục còn thiếu theo mức, ví dụ `2 recommended, 1 optional missing` (hoặc `nothing missing`); project chưa Ready ghi `not ready`.", "Every listed project is re-checked whenever the tab opens. The line under each name in the left list counts what is missing by level, e.g. `2 recommended, 1 optional missing` (or `nothing missing`); a project that is not Ready says `not ready`."],
        ["Cùng phép kiểm tra chạy được trong CI: `primeoffice check <thư mục>` (xem chủ đề **Command line**).", "The same check runs in CI: `primeoffice check <folder>` (see the **Command line** topic)."],
      ),
    ),
  ],
};

// ---------------------------------------------------------------- History

const history: HelpTopic = {
  id: "history",
  title: { vi: "History — lịch sử session", en: "History — recent sessions" },
  summary: {
    vi: "Các session mới nhất của mọi project hoặc một project: tiêu đề, trạng thái, prompt cuối, 3 việc cuối; bấm để xem đầy đủ.",
    en: "The latest sessions of every project or one: title, status, last prompt, last three actions; click one for the full view.",
  },
  sections: [
    section(
      "Cách dùng",
      "How to use it",
      steps(
        ["Chọn **Project**: **All projects** (mọi session Claude Code trên máy) hoặc một project đã mở trong Projects.", "Pick a **Project**: **All projects** (every Claude Code session on this PC) or a project opened in Projects."],
        ["Chọn **Show**: `10`, `30`, `60` hoặc `120 latest` — số session mới nhất (theo thời điểm transcript thay đổi).", "Pick **Show**: `10`, `30`, `60` or `120 latest` — how many of the newest sessions (by when the transcript last changed)."],
        ["Bấm một session ở bên trái để xem chi tiết ở bên phải (xem chủ đề **Agent details**). **Refresh** (F5) tải lại.", "Click a session on the left to see its details on the right (see the **Agent details** topic). **Refresh** (F5) reloads."],
      ),
    ),
    section(
      "Mỗi dòng cho biết",
      "What each row shows",
      tips(
        ["Tiêu đề (hoặc `Untitled session`) và trạng thái (**Working**, **Needs you**, **Turn done**, **Idle**).", "The title (or `Untitled session`) and status (**Working**, **Needs you**, **Turn done**, **Idle**)."],
        ["Prompt cuối (2 dòng), 3 việc gần nhất với biểu tượng theo loại, rồi thư mục · thời gian.", "The last prompt (2 lines), the three latest actions with an icon per kind, then folder · time."],
      ),
    ),
    section(
      "Mẹo",
      "Tips",
      tips(
        ["Thả một thư mục vào tab History để vừa mở project vừa lọc History theo nó.", "Drop a folder on the History tab to open it as a project and filter History to it at once."],
        ["**Idle** dựa trên khoảng **Active in** của Office: session cũ hơn khoảng đó là Idle.", "**Idle** uses the Office's **Active in** window: sessions older than that are Idle."],
        ["Session Claude Code và Codex CLI hiện ở đây; Gemini sẽ có sau. History chỉ đọc transcript, không xoá hay sửa gì.", "Claude Code and Codex CLI sessions appear here; Gemini comes later. History only reads transcripts; it never deletes or edits anything."],
        ["Lựa chọn Project / Show không được nhớ khi mở lại ứng dụng.", "The Project / Show choice is not remembered when the app restarts."],
      ),
    ),
  ],
};

// ---------------------------------------------------------------- Agents (providers)

const providers: HelpTopic = {
  id: "providers",
  title: { vi: "Agents — các agent trên máy", en: "Agents — providers on this PC" },
  summary: {
    vi: "Claude Code, Codex CLI (ChatGPT), Gemini CLI và DeepSeek: có trên máy không, thư mục session ở đâu, đã hiện được trong văn phòng chưa.",
    en: "Claude Code, Codex CLI (ChatGPT), Gemini CLI and DeepSeek: found on this PC or not, where their sessions are, whether the office can show them.",
  },
  sections: [
    section(
      "Mỗi thẻ cho biết",
      "What each card shows",
      tips(
        ["Trạng thái: **Active** (có session thay đổi trong 30 phút qua), **Found** (có thư mục session), **Not found**, **Planned** (đã biết nhưng chưa hỗ trợ).", "State: **Active** (sessions changed in the last 30 minutes), **Found** (its session folder exists), **Not found**, **Planned** (known but not supported yet)."],
        ["Ghi chú, đường dẫn thư mục session, số session gần đây (30 phút) và **Shown in the office** / **Not in the office yet**.", "A note, the session folder path, recent sessions (30 minutes) and **Shown in the office** / **Not in the office yet**."],
        ["**Refresh** (hoặc F5) dò lại.", "**Refresh** (or F5) detects again."],
      ),
    ),
    section(
      "Từng agent",
      "Each agent",
      tips(
        ["**Claude Code**: hỗ trợ đầy đủ — `~/.claude/projects`, gồm session CLI, Desktop app và IDE. **Not found**: chạy `claude` một lần để tạo thư mục.", "**Claude Code**: fully supported — `~/.claude/projects`, CLI, Desktop app and IDE sessions. **Not found**: run `claude` once to create the folder."],
        ["**Codex CLI (ChatGPT)**: đọc các file rollout trong `~/.codex/sessions` — prompt, lệnh chạy, file sửa, câu trả lời cuối, context đã dùng. Chưa đoán trạng thái chờ quyền. **Not found**: chạy `codex` một lần.", "**Codex CLI (ChatGPT)**: reads the rollout files in `~/.codex/sessions` — prompts, commands, edited files, the last reply, context used. Waiting for permission is not guessed yet. **Not found**: run `codex` once."],
        ["**Gemini CLI**: chỉ kiểm tra `~/.gemini/tmp`; đọc session sẽ có ở bản sau.", "**Gemini CLI**: only `~/.gemini/tmp` is checked; reading its sessions comes in a later version."],
        ["**DeepSeek**: luôn **Planned** — chưa có định dạng session cục bộ; sẽ đi qua công cụ chạy DeepSeek.", "**DeepSeek**: always **Planned** — no local session format yet; it will come through the tool that runs DeepSeek."],
      ),
      tips(["Tab này chỉ đọc; nó không cài, cấu hình hay khởi chạy agent nào. Thả thư mục vào tab này (hoặc Ctrl+O) mở nó như một project và chuyển sang **Projects**.", "This tab only reads; it never installs, configures or starts an agent. Dropping a folder on this tab (or Ctrl+O) opens it as a project and takes you to **Projects**."]),
    ),
  ],
};

// ---------------------------------------------------------------- command line

const cli: HelpTopic = {
  id: "cli",
  title: { vi: "Dòng lệnh", en: "Command line" },
  summary: {
    vi: "primeoffice.exe check / history / providers: kiểm tra project, xem lịch sử, dò agent từ terminal hoặc CI, có báo cáo JSON và mã thoát.",
    en: "primeoffice.exe check / history / providers: check a project, read its history, detect agents from a terminal or CI, with a JSON report and exit codes.",
  },
  sections: [
    section(
      "Lệnh",
      "Commands",
      keys(
        ["check <thư mục>", "Kiểm tra theo chuẩn project, in mọi mục thiếu kèm cách sửa", "Check against the project standard, print every missing item with its fix"],
        ["history <thư mục> --last N", "N session mới nhất (mặc định 5): prompt cuối, việc gần đây, câu trả lời cuối", "The N newest sessions (default 5): last prompt, recent actions, last reply"],
        ["providers", "Claude Code / Codex / Gemini / DeepSeek trên máy", "Claude Code / Codex / Gemini / DeepSeek on this PC"],
        ["--help", "Trợ giúp và ví dụ", "Help and examples"],
      ),
      tips(
        ["`check`: `--report r.json` ghi báo cáo JSON (đúng cấu trúc ứng dụng hiển thị), `--fail-on warn|error` (mặc định `error`), `--quiet` chỉ in dòng tóm tắt và lỗi. `history`: `--report r.json`.", "`check`: `--report r.json` writes the JSON report (the same structure the app shows), `--fail-on warn|error` (default `error`), `--quiet` prints only the summary and errors. `history`: `--report r.json`."],
        ["Mã thoát: `0` xong, không có vấn đề ở mức `--fail-on`; `1` có vấn đề ở mức đó (ví dụ project chưa Ready); `2` sai tham số hoặc thiếu thư mục.", "Exit codes: `0` done, no issue at the `--fail-on` level; `1` issues at that level (e.g. a project that is not Ready); `2` bad arguments or a missing folder."],
        ["Trong `cmd.exe` dùng `start /wait primeoffice.exe …` để chờ mã thoát; PowerShell và CI gọi trực tiếp. Tham số đầu tiên khác các lệnh trên thì cửa sổ ứng dụng mở như thường.", "In `cmd.exe` use `start /wait primeoffice.exe …` to wait for the exit code; PowerShell and CI call it directly. Any other first argument opens the app window as usual."],
        ["`primeoffice.exe <thư mục>` (hoặc **Open with** PrimeOffice trên một thư mục trong Explorer): cửa sổ mở và thư mục được mở như khi thả vào tab **Office** — văn phòng lọc theo nó nếu Ready, nếu chưa thì chuyển sang **Projects**. Tham số không phải thư mục bị bỏ qua (có cảnh báo trong log).", "`primeoffice.exe <folder>` (or **Open with** PrimeOffice on a folder in Explorer): the window opens and the folder is opened as if dropped on the **Office** tab — the office filters to it when it is Ready, otherwise you are taken to **Projects**. An argument that is not a folder is ignored (with a warning in the log)."],
      ),
    ),
  ],
};

/** Every topic, in panel order: Getting started, then the tabs in rail order with their sub-topics, then the command line. */
// ---------------------------------------------------------------- Chat

const chat: HelpTopic = {
  id: "chat",
  title: { vi: "Chat — giao việc cho agent", en: "Chat — give an agent work" },
  summary: {
    vi: "Viết yêu cầu, Claude Code làm trong thư mục bạn chọn. Mỗi cuộc trò chuyện là một session Claude Code bình thường: nối tiếp được từ terminal hay Claude Desktop.",
    en: "Write what you want done and Claude Code does it in the folder you pick. Every conversation is an ordinary Claude Code session: continue it from a terminal or Claude Desktop.",
  },
  sections: [
    section(
      "Cách dùng",
      "How to use it",
      tips(
        ["Chọn **Folder** (thư mục project — của studio đang mở trước), gõ yêu cầu, **Enter** để gửi (**Shift+Enter** xuống dòng). Câu trả lời hiện dần; mỗi tool agent dùng là một dòng (đang chạy, xong, lỗi).", "Pick a **Folder** (a project folder — the open studio's first), write the task, **Enter** to send (**Shift+Enter** for a new line). The reply streams in; each tool the agent uses is a line (running, done, failed)."],
        ["Cột trái là các **session Claude Code của thư mục đó** — gồm cả session bạn mở từ terminal hay Claude Desktop. Bấm một session để **nối tiếp** nó; **New session** để bắt đầu mới. Khi nối tiếp chỉ hiện lượt trao đổi cuối, nhưng agent có toàn bộ cuộc trò chuyện.", "The left column lists the **folder's Claude Code sessions** — including the ones you started in a terminal or Claude Desktop. Click one to **continue** it; **New session** starts fresh. Continuing shows only the last exchange, but the agent has the whole conversation."],
        ["**Stop** dừng lượt đang chạy. Lượt vẫn chạy khi bạn sang tab khác; nhân vật của session xuất hiện trong Office như mọi session.", "**Stop** ends the running turn. A turn keeps running while you are on another tab; the session's character appears in Office like any session."],
        ["Đừng gửi tin cho **cùng một session** từ hai nơi cùng lúc (Chat và Claude Desktop): hai bên sẽ ghi chồng lên nhau.", "Do not message the **same session** from two places at once (Chat and Claude Desktop): they would write over each other."],
      ),
    ),
    section(
      "Quyền của agent (May)",
      "What the agent may do (May)",
      tips(
        ["Một lượt Chat không dừng lại hỏi bạn được: việc gì không được phép thì **bị từ chối** và có dòng báo ở cuối lượt.", "A Chat turn cannot stop to ask you: what is not allowed is **refused**, with a note at the end of the turn."],
        ["**Edit files** (mặc định): đọc và sửa file trong thư mục; lệnh chỉ chạy khi settings Claude Code của project cho phép. **Plan only**: chỉ đọc và lập kế hoạch. **Ask first**: chỉ những gì settings đã cho phép. **Full auto**: không kiểm tra quyền — chỉ dùng trong thư mục bạn chấp nhận mất.", "**Edit files** (default): reads and edits files in the folder; commands run only when the project's Claude Code settings allow them. **Plan only**: reads and plans. **Ask first**: only what your settings already allow. **Full auto**: no permission checks — only in a folder you can afford to lose."],
      ),
    ),
    section(
      "Tài khoản và Claude Desktop",
      "Your account and Claude Desktop",
      tips(
        ["PrimeOffice chạy **chính CLI `claude` của Anthropic** trên máy bạn (`claude -p`, chế độ không tương tác có trong tài liệu). CLI tự đăng nhập như trong terminal; PrimeOffice không đọc token, không gọi máy chủ của Anthropic. Lượt Chat tính vào hạn mức gói của bạn.", "PrimeOffice runs **Anthropic's own `claude` CLI** on your PC (`claude -p`, its documented non-interactive mode). The CLI signs in by itself as in a terminal; PrimeOffice reads no token and calls no Anthropic server. Chat turns count against your plan's limits."],
        ["Chưa có CLI: cài Claude Code, chạy `claude` một lần trong terminal và đăng nhập ở đó.", "No CLI yet: install Claude Code, run `claude` once in a terminal and sign in there."],
        ["Session tạo từ Chat là session Claude Code thật (`~/.claude/projects`). Trong **Claude Desktop** gõ `/resume` ở ô nhập để mở nó; nó **không tự hiện** trong danh sách bên trái của Desktop, vì Desktop chỉ liệt kê session do chính nó tạo. Trong terminal: `claude --resume`.", "A session made in Chat is a real Claude Code session (`~/.claude/projects`). In **Claude Desktop** type `/resume` in the prompt box to open it; it does **not appear by itself** in Desktop's sidebar, because Desktop lists only the sessions it created. In a terminal: `claude --resume`."],
        ["Chat hiện chỉ chạy Claude Code. Codex và Gemini sẽ có sau.", "Chat runs Claude Code only for now. Codex and Gemini come later."],
      ),
    ),
  ],
};

export const HELP_TOPICS: HelpTopic[] = [gettingStarted, office, officeLayout, session, chat, projects, history, providers, cli];
