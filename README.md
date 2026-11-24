> 欢迎 QQ 群 1014985431 沟通交流、反馈 bug、提交需求。

# Task Manager for SiYuan (`sy-task-manage`)

Tasks, projects, calendar, kanban and Gantt — together with your notes.

![Task Manager](screenshots/overview.png)

## Quick start

1. **Install** — search for “Task Manager” in the SiYuan marketplace, install and enable it. A task icon appears in the sidebar.
2. **Create** — click `+` in the sidebar, or use **Block menu → Plugins → Set as task** in a document.
3. **Switch views** — use the bottom bar to open Kanban, Calendar or Gantt. Everything stays in sync.

> Type `@` in a document to mention Mankeep contacts; type `@today`, `@tomorrow` or `@2026-11-18` to insert a date heading.

## Document, calendar, kanban and Gantt — the same task

**Change it anywhere; everything updates.**

Tasks are bound to blocks in your document. The document is the source of truth; calendar, kanban and Gantt are views of the same data:

- A task block under a date heading appears on that date in the calendar
- Dragging a task in the calendar moves its block to the new date heading
- Renaming, moving or deleting a block updates every view

<p align="center"><img src="screenshots/document-sync.png" width="90%" alt="Document, calendar, kanban and Gantt stay in sync"></p>

## Four views, one source of data

<p align="center"><img src="screenshots/four-views.png" width="92%" alt="Document, calendar, kanban and Gantt"></p>

## Features

- **Tasks and projects** — create, edit, complete, abandon and search tasks; group projects by category.
- **Block binding** — bind any block to a task. Editing the bound block or moving it under another date heading updates the task and all views.
- **Document integration** — calendar/kanban task creation writes a block under the date heading; deleting a task cleans up its block and empty headings.
- **Calendar** — month, week and list views; lunar dates; drag to reschedule, resize multi-day tasks, complete from an event.
- **Kanban** — todo / doing / done / abandoned columns with category and project filters.
- **Gantt** — timeline with search, sort, status, project/category and completion filters; drag bars to shift dates.
- **Auto calendar** — new checklist items under a date heading become tasks automatically; H5/H6 headings can be enabled in settings.
- **Reminders** — on time, 5/10/15/30 minutes before, or 1/2 hours before; notifications are de-duplicated per day.
- **Pomodoro** — 25-minute focus sessions with automatic 5/15-minute breaks, pause/resume and per-task counts.
- **Statistics** — a “Statistics” entry in the sidebar with task, project and pomodoro summaries; task completion and pomodoro heatmaps support 30 days, 90 days, 6 months and 12 months, default to 12 months, and can be filtered by project.
- **Repeating tasks** — daily, weekly, monthly or yearly with interval and end date.
- **Import/export** — JSON backup and legacy task-plugin import.
- **Privacy mode** — masks task and project names in calendar and kanban.

## Installation

### Marketplace

Open *Settings → Marketplace*, search for **事项管理** (Task Manager), install and enable it.

### Manual

Download `package.zip` from the latest GitHub release and extract it into:

```text
{workspace}/data/plugins/sy-task-manage/
```

Then enable the plugin in *Settings → Marketplace → Downloaded*.

## Usage

### Create a task

Use the sidebar `+`, calendar, kanban, or **Block menu → Plugins → Set as task** in a document.

### Bind a document block

Click a task title to jump to its block; click elsewhere in the row to edit. Task title and date stay in sync with the block.

### Switch views

- **Calendar** — month, week and list views; drag to reschedule or select multiple days.
- **Kanban** — drag cards between statuses; filter by project or category.
- **Gantt** — view the project timeline and drag bars to move dates.

### Reminders and Pomodoro

Set start/end time and a reminder offset while creating or editing a task. Hover a task row to start a Pomodoro.

### Document mentions

- `@name` — insert a contact link
- `@today` / `@tomorrow` / `@2026-11-18` — insert a date heading
- After inserting a date heading with `@date`, the mention text is removed automatically

## Use with Mankeep

[Mankeep](https://github.com/ccztao/siyuan-mankeep) is the companion contact/relationship manager for SiYuan. This plugin reads contact documents from Mankeep:

- Type `@name` in a task to link a contact
- Type `@name` in a document to insert a contact link
- Keep contacts, dates and tasks together in the same document

The two plugins are designed to work together and are recommended as a pair.

## Requirements

- SiYuan **3.1.0** or newer (desktop and web).
- Optional: a notebook named **Mankeep** or **人脉** containing contact documents for `@` mentions.

## Data

Tasks, projects and settings are stored in SiYuan's plugin data directory. JSON import/export is available for backup and migration.

## License

MIT. See [LICENSE](LICENSE).
