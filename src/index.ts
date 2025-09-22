import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with project management tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Project Management Board",
		version: "1.0.0",
	});

	env: Env;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.env = env;
	}

	async init() {
		// Get all tasks from a specific column
		this.server.tool(
			"get_tasks",
			{ column_id: z.number().optional() },
			async ({ column_id }) => {
				try {
					let query = `
						SELECT t.*, c.name as column_name, c.color as column_color 
						FROM tasks t 
						JOIN columns c ON t.column_id = c.id 
						WHERE t.status = 'active'
					`;
					const params: any[] = [];
					
					if (column_id) {
						query += " AND t.column_id = ?";
						params.push(column_id);
					}
					
					query += " ORDER BY c.position, t.position";
					
					const result = await this.env.project_management_db.prepare(query).bind(...params).all();
					
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									tasks: result.results,
									count: result.results.length
								}, null, 2)
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);

		// Get all columns
		this.server.tool(
			"get_columns",
			{},
			async () => {
				try {
					const result = await this.env.project_management_db
						.prepare("SELECT * FROM columns ORDER BY position")
						.all();
					
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									columns: result.results
								}, null, 2)
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);

		// Create a new task
		this.server.tool(
			"create_task",
			{
				title: z.string(),
				description: z.string().optional(),
				column_id: z.number(),
				priority: z.enum(["low", "medium", "high"]).optional()
			},
			async ({ title, description, column_id, priority = "medium" }) => {
				try {
					// Generate task ID
					const taskCount = await this.env.project_management_db
						.prepare("SELECT COUNT(*) as count FROM tasks")
						.first();
					const taskId = `DEV-${String((taskCount?.count as number || 0) + 101).padStart(3, '0')}`;

					// Get the next position in the column
					const positionResult = await this.env.project_management_db
						.prepare("SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM tasks WHERE column_id = ?")
						.bind(column_id)
						.first();

					const position = positionResult?.next_position as number || 1;

					const result = await this.env.project_management_db
						.prepare(`
							INSERT INTO tasks (title, description, task_id, column_id, position, priority)
							VALUES (?, ?, ?, ?, ?, ?)
						`)
						.bind(title, description || "", taskId, column_id, position, priority)
						.run();

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									task_id: taskId,
									id: result.meta.last_row_id
								}, null, 2)
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);

		// Update a task
		this.server.tool(
			"update_task",
			{
				task_id: z.string(),
				title: z.string().optional(),
				description: z.string().optional(),
				priority: z.enum(["low", "medium", "high"]).optional()
			},
			async ({ task_id, title, description, priority }) => {
				try {
					const updates: string[] = [];
					const params: any[] = [];

					if (title !== undefined) {
						updates.push("title = ?");
						params.push(title);
					}
					if (description !== undefined) {
						updates.push("description = ?");
						params.push(description);
					}
					if (priority !== undefined) {
						updates.push("priority = ?");
						params.push(priority);
					}

					if (updates.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({
										success: false,
										error: "No fields to update"
									})
								}
							]
						};
					}

					updates.push("updated_at = CURRENT_TIMESTAMP");
					params.push(task_id);

					const result = await this.env.project_management_db
						.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE task_id = ?`)
						.bind(...params)
						.run();

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									changes: result.meta.changes
								}, null, 2)
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);

		// Move a task to a different column
		this.server.tool(
			"move_task",
			{
				task_id: z.string(),
				new_column_id: z.number(),
				new_position: z.number().optional()
			},
			async ({ task_id, new_column_id, new_position }) => {
				try {
					// Get current task info
					const currentTask = await this.env.project_management_db
						.prepare("SELECT column_id, position FROM tasks WHERE task_id = ?")
						.bind(task_id)
						.first();

					if (!currentTask) {
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({
										success: false,
										error: "Task not found"
									})
								}
							]
						};
					}

					const currentColumnId = currentTask.column_id as number;
					const currentPosition = currentTask.position as number;

					// If moving within the same column, just update position
					if (currentColumnId === new_column_id) {
						if (new_position === undefined) {
							return {
								content: [
									{
										type: "text",
										text: JSON.stringify({
											success: true,
											message: "Task already in target column"
										})
									}
								]
							};
						}

						// Update positions in the same column
						if (new_position > currentPosition) {
							await this.env.project_management_db
								.prepare("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?")
								.bind(currentColumnId, currentPosition, new_position)
								.run();
						} else {
							await this.env.project_management_db
								.prepare("UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?")
								.bind(currentColumnId, new_position, currentPosition)
								.run();
						}
					} else {
						// Moving to a different column
						// First, shift tasks in the old column
						await this.env.project_management_db
							.prepare("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?")
							.bind(currentColumnId, currentPosition)
							.run();

						// Get the target position
						let targetPosition = new_position;
						if (targetPosition === undefined) {
							const maxPosResult = await this.env.project_management_db
								.prepare("SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM tasks WHERE column_id = ?")
								.bind(new_column_id)
								.first();
							targetPosition = maxPosResult?.next_position as number || 1;
						} else {
							// Shift tasks in the new column
							await this.env.project_management_db
								.prepare("UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?")
								.bind(new_column_id, targetPosition)
								.run();
						}

						// Update the task
						await this.env.project_management_db
							.prepare("UPDATE tasks SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE task_id = ?")
							.bind(new_column_id, targetPosition, task_id)
							.run();
					}

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									message: "Task moved successfully"
								})
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);

		// Delete a task
		this.server.tool(
			"delete_task",
			{ task_id: z.string() },
			async ({ task_id }) => {
				try {
					// Get task info for position adjustment
					const task = await this.env.project_management_db
						.prepare("SELECT column_id, position FROM tasks WHERE task_id = ?")
						.bind(task_id)
						.first();

					if (!task) {
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({
										success: false,
										error: "Task not found"
									})
								}
							]
						};
					}

					const columnId = task.column_id as number;
					const position = task.position as number;

					// Delete the task
					const result = await this.env.project_management_db
						.prepare("DELETE FROM tasks WHERE task_id = ?")
						.bind(task_id)
						.run();

					// Adjust positions of remaining tasks in the column
					await this.env.project_management_db
						.prepare("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?")
						.bind(columnId, position)
						.run();

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									changes: result.meta.changes
								}, null, 2)
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);

		// Get the full Kanban board data
		this.server.tool(
			"get_board",
			{},
			async () => {
				try {
					const columns = await this.env.project_management_db
						.prepare("SELECT * FROM columns ORDER BY position")
						.all();

					const tasks = await this.env.project_management_db
						.prepare(`
							SELECT t.*, c.name as column_name, c.color as column_color 
							FROM tasks t 
							JOIN columns c ON t.column_id = c.id 
							WHERE t.status = 'active'
							ORDER BY c.position, t.position
						`)
						.all();

					// Group tasks by column
					const boardData = columns.results.map((column: any) => ({
						...column,
						tasks: tasks.results.filter((task: any) => task.column_id === column.id)
					}));

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: true,
									board: boardData
								}, null, 2)
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									success: false,
									error: error instanceof Error ? error.message : "Unknown error"
								})
							}
						]
					};
				}
			}
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Serve the main HTML page
		if (url.pathname === "/" || url.pathname === "/index.html") {
			try {
				const html = await env.ASSETS.fetch(new URL("/index.html", request.url));
				return new Response(html.body, {
					headers: {
						"Content-Type": "text/html",
						"Cache-Control": "no-cache"
					}
				});
			} catch (error) {
				// Fallback HTML if ASSETS is not available
				const fallbackHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Management Board</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 2rem; text-align: center; }
        .error { color: #dc2626; background: #fef2f2; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; }
    </style>
</head>
<body>
    <h1>Project Management Board</h1>
    <div class="error">
        <p>Static assets not available. Please deploy the worker with the public directory.</p>
        <p>MCP endpoints are available at /mcp and /sse</p>
    </div>
</body>
</html>`;
				return new Response(fallbackHtml, {
					headers: { "Content-Type": "text/html" }
				});
			}
		}

		// Serve static assets
		if (url.pathname.startsWith("/public/")) {
			try {
				const assetPath = url.pathname.substring(1); // Remove leading slash
				const asset = await env.ASSETS.fetch(new URL(assetPath, request.url));
				return new Response(asset.body, {
					headers: {
						"Content-Type": getContentType(url.pathname),
						"Cache-Control": "public, max-age=31536000"
					}
				});
			} catch (error) {
				return new Response("Asset not found", { status: 404 });
			}
		}

		// REST API endpoints for the frontend
		if (url.pathname === "/api/board") {
			return this.handleBoardRequest(request, env);
		}

		if (url.pathname === "/api/tasks" && request.method === "POST") {
			return this.handleCreateTask(request, env);
		}

		if (url.pathname.startsWith("/api/tasks/") && request.method === "PUT") {
			return this.handleMoveTask(request, env);
		}

		// MCP endpoints
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			// Create a modified request with proper headers for MCP
			const modifiedRequest = new Request(request, {
				headers: {
					...Object.fromEntries(request.headers.entries()),
					'Accept': 'application/json, text/event-stream',
					'Content-Type': 'application/json'
				}
			});
			return MyMCP.serve("/mcp").fetch(modifiedRequest, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},

	// REST API handlers
	async handleBoardRequest(request: Request, env: Env): Promise<Response> {
		try {
			const columns = await env.project_management_db
				.prepare("SELECT * FROM columns ORDER BY position")
				.all();

			const tasks = await env.project_management_db
				.prepare(`
					SELECT t.*, c.name as column_name, c.color as column_color 
					FROM tasks t 
					JOIN columns c ON t.column_id = c.id 
					WHERE t.status = 'active'
					ORDER BY c.position, t.position
				`)
				.all();

			// Group tasks by column
			const boardData = columns.results.map((column: any) => ({
				...column,
				tasks: tasks.results.filter((task: any) => task.column_id === column.id)
			}));

			return new Response(JSON.stringify({
				success: true,
				board: boardData
			}), {
				headers: { "Content-Type": "application/json" }
			});
		} catch (error) {
			return new Response(JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error"
			}), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			});
		}
	},

	async handleCreateTask(request: Request, env: Env): Promise<Response> {
		try {
			const body = await request.json() as {
				title: string;
				description?: string;
				column_id?: number;
				priority?: "low" | "medium" | "high";
			};
			const { title, description, column_id = 1, priority = "medium" } = body;

			// Generate task ID
			const taskCount = await env.project_management_db
				.prepare("SELECT COUNT(*) as count FROM tasks")
				.first();
			const taskId = `DEV-${String((taskCount?.count as number || 0) + 101).padStart(3, '0')}`;

			// Get the next position in the column
			const positionResult = await env.project_management_db
				.prepare("SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM tasks WHERE column_id = ?")
				.bind(column_id)
				.first();

			const position = positionResult?.next_position as number || 1;

			const result = await env.project_management_db
				.prepare(`
					INSERT INTO tasks (title, description, task_id, column_id, position, priority)
					VALUES (?, ?, ?, ?, ?, ?)
				`)
				.bind(title, description || "", taskId, column_id, position, priority)
				.run();

			return new Response(JSON.stringify({
				success: true,
				task_id: taskId,
				id: result.meta.last_row_id
			}), {
				headers: { "Content-Type": "application/json" }
			});
		} catch (error) {
			return new Response(JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error"
			}), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			});
		}
	},

	async handleMoveTask(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);
			const taskId = url.pathname.split('/').pop();
			const body = await request.json() as {
				new_column_id: number;
				new_position?: number;
			};
			const { new_column_id, new_position } = body;

			if (!taskId) {
				return new Response(JSON.stringify({
					success: false,
					error: "Task ID is required"
				}), {
					status: 400,
					headers: { "Content-Type": "application/json" }
				});
			}

			// Get current task info
			const currentTask = await env.project_management_db
				.prepare("SELECT column_id, position FROM tasks WHERE task_id = ?")
				.bind(taskId)
				.first();

			if (!currentTask) {
				return new Response(JSON.stringify({
					success: false,
					error: "Task not found"
				}), {
					status: 404,
					headers: { "Content-Type": "application/json" }
				});
			}

			const currentColumnId = currentTask.column_id as number;
			const currentPosition = currentTask.position as number;

			// If moving within the same column, just update position
			if (currentColumnId === new_column_id) {
				if (new_position === undefined) {
					return new Response(JSON.stringify({
						success: true,
						message: "Task already in target column"
					}), {
						headers: { "Content-Type": "application/json" }
					});
				}

				// Update positions in the same column
				if (new_position > currentPosition) {
					await env.project_management_db
						.prepare("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?")
						.bind(currentColumnId, currentPosition, new_position)
						.run();
				} else {
					await env.project_management_db
						.prepare("UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?")
						.bind(currentColumnId, new_position, currentPosition)
						.run();
				}
			} else {
				// Moving to a different column
				// First, shift tasks in the old column
				await env.project_management_db
					.prepare("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?")
					.bind(currentColumnId, currentPosition)
					.run();

				// Get the target position
				let targetPosition = new_position;
				if (targetPosition === undefined) {
					const maxPosResult = await env.project_management_db
						.prepare("SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM tasks WHERE column_id = ?")
						.bind(new_column_id)
						.first();
					targetPosition = maxPosResult?.next_position as number || 1;
				} else {
					// Shift tasks in the new column
					await env.project_management_db
						.prepare("UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?")
						.bind(new_column_id, targetPosition)
						.run();
				}

				// Update the task
				await env.project_management_db
					.prepare("UPDATE tasks SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE task_id = ?")
					.bind(new_column_id, targetPosition, taskId)
					.run();
			}

			return new Response(JSON.stringify({
				success: true,
				message: "Task moved successfully"
			}), {
				headers: { "Content-Type": "application/json" }
			});
		} catch (error) {
			return new Response(JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error"
			}), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			});
		}
	}
};

function getContentType(pathname: string): string {
	const ext = pathname.split('.').pop()?.toLowerCase();
	switch (ext) {
		case 'html': return 'text/html';
		case 'css': return 'text/css';
		case 'js': return 'application/javascript';
		case 'json': return 'application/json';
		case 'png': return 'image/png';
		case 'jpg':
		case 'jpeg': return 'image/jpeg';
		case 'gif': return 'image/gif';
		case 'svg': return 'image/svg+xml';
		default: return 'text/plain';
	}
}
