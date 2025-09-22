-- Project Management Database Schema

-- Create columns table for Kanban board columns
CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    position INTEGER NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    task_id TEXT NOT NULL UNIQUE, -- Human-readable ID like DEV-101
    column_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    priority TEXT DEFAULT 'medium', -- low, medium, high
    status TEXT DEFAULT 'active', -- active, completed, archived
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
);

-- Insert default columns
INSERT OR IGNORE INTO columns (name, position, color) VALUES 
('To Do', 1, '#3b82f6'),
('In Progress', 2, '#f59e0b'),
('Done', 3, '#10b981');

-- Insert sample tasks
INSERT OR IGNORE INTO tasks (title, task_id, column_id, position, priority) VALUES 
('Design user interface mockups', 'DEV-101', 1, 1, 'high'),
('Set up project repository', 'DEV-102', 1, 2, 'medium'),
('Create database schema', 'DEV-103', 1, 3, 'high'),
('Implement user authentication', 'DEV-104', 3, 1, 'high'),
('Build API endpoints', 'DEV-105', 3, 2, 'medium'),
('Write unit tests', 'DEV-106', 2, 1, 'medium'),
('Deploy to staging environment', 'DEV-107', 3, 3, 'low');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(column_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_columns_position ON columns(position);
