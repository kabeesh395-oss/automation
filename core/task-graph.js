/**
 * JARVIS Task Graph Scheduler
 * 
 * Dependency-aware task graph management and resolution.
 */

export class TaskGraph {
  constructor(tasks = []) {
    this.tasks = [...tasks];
  }

  addTask(task) {
    this.tasks.push(task);
  }

  getTask(id) {
    return this.tasks.find(t => (t.id || t.task_id) === id);
  }

  getAllTasks() {
    return [...this.tasks];
  }

  /**
   * Get all tasks that are ready to run:
   * Status is 'ready' or 'pending', and all dependency tasks are 'done'.
   */
  getReadyTasks() {
    const completedIds = new Set(
      this.tasks
        .filter(t => t.status === 'done')
        .map(t => t.id || t.task_id)
    );

    return this.tasks.filter(t => {
      if (t.status !== 'pending' && t.status !== 'ready') return false;
      const deps = t.dependencies || t.depends_on || [];
      return deps.every(depId => completedIds.has(depId));
    });
  }

  /**
   * Check if there are any cycles in the dependency graph.
   */
  hasCycle() {
    const visited = new Set();
    const recStack = new Set();

    const isCyclic = (taskId) => {
      if (!visited.has(taskId)) {
        visited.add(taskId);
        recStack.add(taskId);

        const task = this.getTask(taskId);
        const deps = task ? (task.dependencies || task.depends_on || []) : [];

        for (const depId of deps) {
          if (!visited.has(depId) && isCyclic(depId)) return true;
          if (recStack.has(depId)) return true;
        }
      }
      recStack.delete(taskId);
      return false;
    };

    for (const task of this.tasks) {
      const id = task.id || task.task_id;
      if (isCyclic(id)) return true;
    }
    return false;
  }

  /**
   * Get a topologically sorted execution order.
   */
  getExecutionOrder() {
    if (this.hasCycle()) {
      throw new Error('Cyclic dependency detected in task graph');
    }

    const order = [];
    const visited = new Set();

    const visit = (taskId) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = this.getTask(taskId);
      const deps = task ? (task.dependencies || task.depends_on || []) : [];
      for (const dep of deps) {
        visit(dep);
      }
      order.push(task);
    };

    for (const task of this.tasks) {
      visit(task.id || task.task_id);
    }

    return order;
  }

  isCompleted() {
    return this.tasks.length > 0 && this.tasks.every(t => t.status === 'done');
  }

  hasFailed() {
    return this.tasks.some(t => t.status === 'failed' || t.status === 'blocked');
  }
}
