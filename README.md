> 欢迎 QQ 群 1014985431 沟通交流、反馈 bug、提交需求。

# Task Manager for SiYuan (`sy-task-manage`)

A lightweight task and project manager for [SiYuan](https://b3log.org/siyuan/). Tasks are bound to document blocks, so your notes and your calendar stay in sync.

- Tasks bound to blocks, with two-way title/date synchronisation
- Projects, categories, kanban and Gantt views
- Month/week/list calendar with lunar dates and multi-day events
- Document date headings, automatic block moving and empty-heading cleanup
- Optional `@` contact mentions from Mankeep contacts
- Reminders, repeating tasks, import/export and privacy mode

![Task Manager preview](https://raw.githubusercontent.com/ccztao/sy-task-manage/main/public/preview.png)

## Features

- **Tasks and projects** — create, edit, complete, abandon and search tasks; group projects by category.
- **Block binding** — bind any block to a task. Editing the bound block's title or moving it under another date heading updates the task, calendar, kanban and Gantt views.
- **Document integration** — calendar/kanban task creation writes a block under the task date heading; deleting a task deletes its block and empty date headings; document `@` mentions insert contact links. Inserting a date heading from `@date` removes the typed mention.
- **Auto calendar** — new checklist items under a date heading become calendar tasks automatically. H5/H6 headings can also become tasks; choose the levels in settings.
- **Calendar** — month, week and list views; lunar dates; drag to reschedule, resize multi-day tasks, complete directly from an event.
- **Kanban** — todo / doing / done / abandoned columns, drag between columns, category and project filtering.
- **Gantt** — timeline with search, sort, status, project/category and completion-range filters; drag bars to shift dates.
- **Pomodoro** — start a 25-minute focus timer from a task's clock button, context menu or edit dialog; automatic 5/15-minute breaks, pause/resume, and per-task session counts.
- **Reminders** — system notifications with configurable advance time (on time, 5/10/15/30 minutes, 1/2 hours), per-day de-duplication and restart catch-up.
- **Repeating tasks** — daily/weekly/monthly/yearly with interval and end date.
- **Import/export** — JSON export/import, plus legacy task-plugin data import.
- **Privacy mode** — masks task and project names in calendar and kanban.

## Requirements

- SiYuan **3.1.0** or newer (desktop and web).
- Optional: a notebook named **Mankeep** or **人脉** containing contact documents for `@` mentions. All other features work without it.

## Installation

### From the SiYuan marketplace

Search for **事项管理** (Task Manager) in *Settings → Marketplace*, install and enable it. A dock icon appears in the left sidebar.

### Manual

Download `package.zip` from the latest GitHub release and extract it into:

```text
{workspace}/data/plugins/sy-task-manage/
```

Then enable **Task Manager** in *Settings → Marketplace → Downloaded*.

## Usage

- Create a task from the dock, the calendar, kanban, or **block menu → Plugins → Set as task**.
- Click a task title to jump to its bound block; click elsewhere in the row to edit.
- Type `@` in a task title/note, or in a document, to mention a Mankeep contact.
- Type `@today`, `@tomorrow` or `@2026-11-18` in a document to insert/jump to a date heading.
- Use the bottom bar to switch between kanban, calendar and Gantt.

## License

MIT. See [LICENSE](LICENSE).
