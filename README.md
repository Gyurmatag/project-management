# Project Management Board

A modern Kanban-style project management board built with Cloudflare Workers, D1 Database, and MCP (Model Context Protocol). This application allows you to manage tasks with drag-and-drop functionality across different columns.

## Features

- **Kanban Board Interface**: Clean, modern UI with drag-and-drop task management
- **Task Management**: Create, update, move, and delete tasks
- **Column Organization**: Organize tasks into "To Do", "In Progress", and "Done" columns
- **Priority System**: Tasks can have low, medium, or high priority
- **Real-time Updates**: Changes are immediately reflected in the UI
- **MCP Integration**: Full MCP server with tools for task management
- **D1 Database**: Persistent storage using Cloudflare's D1 SQLite database

## Architecture

- **Frontend**: Vanilla HTML/CSS/JavaScript with drag-and-drop functionality
- **Backend**: Cloudflare Workers with MCP server
- **Database**: Cloudflare D1 (SQLite) for persistent storage
- **API**: MCP tools for all task operations

## MCP Tools Available

- `get_board`: Get the complete Kanban board with all columns and tasks
- `get_tasks`: Get tasks from a specific column or all tasks
- `get_columns`: Get all available columns
- `create_task`: Create a new task
- `update_task`: Update task title, description, or priority
- `move_task`: Move a task between columns or reorder within a column
- `delete_task`: Delete a task

## Getting Started

### Prerequisites

- Node.js and npm
- Cloudflare account
- Wrangler CLI

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. The D1 database is already configured. If you need to recreate it:
   ```bash
   npx wrangler d1 create project-management-db
   npx wrangler d1 execute project-management-db --file=schema.sql
   ```

### Development

Start the development server:
```bash
npm run dev
```

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Database Schema

The application uses two main tables:

- **columns**: Stores Kanban board columns (To Do, In Progress, Done)
- **tasks**: Stores individual tasks with references to columns

## Usage

1. Open the application in your browser
2. Add new tasks using the input field at the top
3. Drag and drop tasks between columns to update their status
4. Tasks are automatically assigned unique IDs (DEV-101, DEV-102, etc.)
5. Priority levels are indicated by colored dots on each task

## API Endpoints

- `GET /`: Main application interface
- `POST /mcp`: MCP server endpoint for tool calls
- `GET /sse`: Server-sent events endpoint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details