# Notion tracker setup

The Notification Service upserts one Notion page per job. Create a Notion database with the
properties below, then share it with your integration and set `NOTION_TOKEN` + `NOTION_DATABASE_ID`.

## 1. Create an integration
- https://www.notion.so/my-integrations → **New integration** (internal).
- Copy the **Internal Integration Secret** → `.env` `NOTION_TOKEN`.

## 2. Create the database
Create a **full-page database** (e.g. "Job Tracker") with exactly these properties/types:

| Property         | Type          | Filled from            |
|------------------|---------------|------------------------|
| Name             | Title         | role title             |
| Company          | Text          | company                |
| Job ID           | Text          | job UUID (upsert key)  |
| Status           | Select        | pipeline status        |
| Priority         | Select        | high / med / low       |
| Match            | Number        | resume match 0–100     |
| Remote           | Select        | remote_india / …       |
| Technical        | Select        | technical / non_technical |
| AI               | Select        | ai / non_ai            |
| Business Model   | Select        | saas / b2c / other     |
| Institute        | Select        | iit_iim_required / …   |
| Salary           | Text          | parsed salary          |
| Source           | Select        | linkedin / greenhouse… |
| Skills           | Multi-select  | extracted skills       |
| Apply URL        | URL           | apply link             |

> Property **names must match exactly** (they map 1:1 in `lib/notion.ts`). Select/multi-select
> options are created automatically as new values appear.

## 3. Share + configure
- Open the database → **⋯ menu → Connections → Add** your integration.
- Copy the database ID from its URL (the 32-char id before `?v=`) → `.env` `NOTION_DATABASE_ID`.

## 4. Test
After a job is enriched: `npm run notify` (High) or `npm run notify -- --digest` (Med/Low).
Without `NOTION_*` set, the sync silently no-ops.
