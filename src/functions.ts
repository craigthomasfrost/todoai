import { PGliteWithLive } from "@electric-sql/pglite/live";
import { Todo } from "./types";

export const refreshTodos = async (db: PGliteWithLive): Promise<Todo[]> => {
  try {
    const result = await db.query<Todo>(`
      SELECT t.id, t.text, t.completed,
             COALESCE(
               json_agg(
                 json_build_object('id', s.id, 'text', s.text, 'completed', s.completed)
               ) FILTER (WHERE s.id IS NOT NULL),
               '[]'
             )::json as subtasks
      FROM todos t
      LEFT JOIN subtasks s ON t.id = s.todo_id
      GROUP BY t.id
      ORDER BY t.id;
    `);
    return result.rows.map((row) => ({
      ...row,
      subtasks: row.subtasks || [],
    }));
  } catch (error) {
    console.error("Error refreshing todos:", error);
    return [];
  }
};

export const addTodos = async (
  db: PGliteWithLive,
  items: { text: string; subtasks: string[] }[],
): Promise<string[]> => {
  const addedTodos: string[] = [];

  for (const item of items) {
    if (item.text.trim() !== "") {
      try {
        const todoResult = await db.query<{ id: number }>(
          "INSERT INTO todos (text) VALUES ($1) RETURNING id;",
          [item.text.trim()],
        );
        const todoId = todoResult.rows[0].id;

        addedTodos.push(item.text.trim());

        for (const subtext of item.subtasks) {
          if (subtext.trim() !== "") {
            await db.query(
              "INSERT INTO subtasks (todo_id, text) VALUES ($1, $2);",
              [todoId, subtext.trim()],
            );
          }
        }
      } catch (error) {
        console.error(`Error adding todo "${item.text}":`, error);
      }
    }
  }

  return addedTodos;
};

export const addSubtasks = async (
  db: PGliteWithLive,
  todoId: number,
  subtasks: string[],
): Promise<string[]> => {
  const addedSubtasks: string[] = [];

  for (const subtext of subtasks) {
    if (subtext.trim() !== "") {
      try {
        await db.query(
          "INSERT INTO subtasks (todo_id, text) VALUES ($1, $2);",
          [todoId, subtext.trim()],
        );
        addedSubtasks.push(subtext.trim());
      } catch (error) {
        console.error(
          `Error adding subtask "${subtext}" to todo ${todoId}:`,
          error,
        );
      }
    }
  }

  return addedSubtasks;
};

export const completeTodos = async (
  db: PGliteWithLive,
  ids: number[],
): Promise<string[]> => {
  const completedTodos: string[] = [];

  for (const id of ids) {
    try {
      await db.query("UPDATE todos SET completed = TRUE WHERE id = $1;", [id]);
      await db.query(
        "UPDATE subtasks SET completed = TRUE WHERE todo_id = $1;",
        [id],
      );
      const result = await db.query<{ text: string }>(
        "SELECT text FROM todos WHERE id = $1;",
        [id],
      );
      if (result.rows.length > 0) {
        completedTodos.push(result.rows[0].text);
      }
    } catch (error) {
      console.error(`Error completing todo ${id}:`, error);
    }
  }

  return completedTodos;
};

export const completeSubtasks = async (
  db: PGliteWithLive,
  subtaskIds: { todoId: number; subtaskId: number }[],
): Promise<string[]> => {
  const completedSubtasks: string[] = [];

  for (const { subtaskId } of subtaskIds) {
    try {
      await db.query("UPDATE subtasks SET completed = TRUE WHERE id = $1;", [
        subtaskId,
      ]);
      const result = await db.query<{ text: string }>(
        "SELECT text FROM subtasks WHERE id = $1;",
        [subtaskId],
      );
      if (result.rows.length > 0) {
        completedSubtasks.push(result.rows[0].text);
      }
    } catch (error) {
      console.error(`Error completing subtask ${subtaskId}:`, error);
    }
  }

  return completedSubtasks;
};

export const uncompleteTodos = async (
  db: PGliteWithLive,
  ids: number[],
): Promise<string[]> => {
  const uncompletedTodos: string[] = [];

  for (const id of ids) {
    try {
      await db.query("UPDATE todos SET completed = FALSE WHERE id = $1;", [id]);
      await db.query(
        "UPDATE subtasks SET completed = FALSE WHERE todo_id = $1;",
        [id],
      );
      const result = await db.query<{ text: string }>(
        "SELECT text FROM todos WHERE id = $1;",
        [id],
      );
      if (result.rows.length > 0) {
        uncompletedTodos.push(result.rows[0].text);
      }
    } catch (error) {
      console.error(`Error uncompleting todo ${id}:`, error);
    }
  }

  return uncompletedTodos;
};

export const uncompleteSubtasks = async (
  db: PGliteWithLive,
  subtaskIds: { todoId: number; subtaskId: number }[],
): Promise<string[]> => {
  const uncompletedSubtasks: string[] = [];

  for (const { subtaskId } of subtaskIds) {
    try {
      await db.query("UPDATE subtasks SET completed = FALSE WHERE id = $1;", [
        subtaskId,
      ]);
      const result = await db.query<{ text: string }>(
        "SELECT text FROM subtasks WHERE id = $1;",
        [subtaskId],
      );
      if (result.rows.length > 0) {
        uncompletedSubtasks.push(result.rows[0].text);
      }
    } catch (error) {
      console.error(`Error uncompleting subtask ${subtaskId}:`, error);
    }
  }

  return uncompletedSubtasks;
};

export const deleteTodos = async (
  db: PGliteWithLive,
  ids: number[],
): Promise<string[]> => {
  const deletedTodos: string[] = [];

  for (const id of ids) {
    const result = await db.query<{ text: string }>(
      "SELECT text FROM todos WHERE id = $1;",
      [id],
    );

    if (result.rows.length > 0) {
      deletedTodos.push(result.rows[0].text);
      await db.query("DELETE FROM todos WHERE id = $1;", [id]);
    } else {
      console.log(`Todo with id ${id} not found.`);
    }
  }

  return deletedTodos;
};

export const deleteSubtasks = async (
  db: PGliteWithLive,
  subtaskIds: { todoId: number; subtaskId: number }[],
): Promise<string[]> => {
  const deletedSubtasks: string[] = [];

  for (const { subtaskId } of subtaskIds) {
    const result = await db.query<{ text: string }>(
      "SELECT text FROM subtasks WHERE id = $1;",
      [subtaskId],
    );

    if (result.rows.length > 0) {
      deletedSubtasks.push(result.rows[0].text);
      await db.query("DELETE FROM subtasks WHERE id = $1;", [subtaskId]);
    } else {
      console.log(`Subtask with id ${subtaskId} not found.`);
    }
  }

  return deletedSubtasks;
};
