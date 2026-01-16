import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Task, UserTask, UserTaskWithDetails, TaskStatus, GlobalTaskStats } from '../types';
import { db } from '../lib/db';

export function useTaskApp() {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userTasks, setUserTasks] = useState<UserTask[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load initial data
  useEffect(() => {
    setUsers(db.getUsers());
    setTasks(db.getTasks());
    setUserTasks(db.getUserTasks());
    setCurrentUser(db.getCurrentUser());
    setIsInitialized(true);
  }, []);

  // Sync with localStorage across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('task_app_')) {
        setUsers(db.getUsers());
        setTasks(db.getTasks());
        setUserTasks(db.getUserTasks());
        setCurrentUser(db.getCurrentUser());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = useCallback((username: string, passwordHash: string) => {
    const user = users.find(u => u.username === username && u.passwordHash === passwordHash);
    if (user) {
      setCurrentUser(user);
      db.setCurrentUser(user);
      return true;
    }
    return false;
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    db.setCurrentUser(null);
  }, []);

  const userTasksWithDetails = useMemo((): UserTaskWithDetails[] => {
    if (!isInitialized) return [];
    
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const userMap = new Map(users.map(u => [u.id, u]));
    
    return userTasks.map(ut => ({
      ...ut,
      taskDesignation: taskMap.get(ut.taskId)?.designation || 'Tâche supprimée',
      username: userMap.get(ut.userId)?.username || 'Utilisateur inconnu',
    })).sort((a, b) => {
      // Sort by updatedAt descending
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [userTasks, tasks, users, isInitialized]);

  const globalStats = useMemo((): GlobalTaskStats[] => {
    if (!isInitialized) return [];

    return tasks.map(task => {
      const assignments = userTasks.filter(ut => ut.taskId === task.id);
      const completedCount = assignments.filter(ut => ut.status === 'COMPLETED').length;
      return {
        taskId: task.id,
        designation: task.designation,
        totalAssigned: assignments.length,
        completedCount,
        progressPercentage: assignments.length > 0 ? (completedCount / assignments.length) * 100 : 0
      };
    });
  }, [tasks, userTasks, isInitialized]);

  // Manager Actions
  const addUser = useCallback((username: string, passwordHash: string) => {
    const newUser: User = { id: crypto.randomUUID(), username, passwordHash, role: 'USER' };
    setUsers(prev => {
      const updated = [...prev, newUser];
      db.saveUsers(updated);
      return updated;
    });
  }, []);

  const deleteUser = useCallback((userId: string) => {
    setUsers(prev => {
      const updated = prev.filter(u => u.id !== userId);
      db.saveUsers(updated);
      return updated;
    });
    // Cleanup assignments
    setUserTasks(prev => {
      const updated = prev.filter(ut => ut.userId !== userId);
      db.saveUserTasks(updated);
      return updated;
    });
  }, []);

  const createTask = useCallback((designation: string) => {
    const newTask: Task = { id: crypto.randomUUID(), designation };
    setTasks(prev => {
      const updated = [...prev, newTask];
      db.saveTasks(updated);
      return updated;
    });
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== taskId);
      db.saveTasks(updated);
      return updated;
    });
    // Cleanup assignments
    setUserTasks(prev => {
      const updated = prev.filter(ut => ut.taskId !== taskId);
      db.saveUserTasks(updated);
      return updated;
    });
  }, []);

  const assignTask = useCallback((taskId: string, userId: string) => {
    const exists = userTasks.some(ut => ut.taskId === taskId && ut.userId === userId);
    if (exists) return;

    const newAssignment: UserTask = {
      id: crypto.randomUUID(),
      taskId,
      userId,
      status: 'NOT_STARTED',
      updatedAt: new Date().toISOString()
    };
    setUserTasks(prev => {
      const updated = [...prev, newAssignment];
      db.saveUserTasks(updated);
      return updated;
    });
  }, [userTasks]);

  const updateTaskProgress = useCallback((assignmentId: string, updates: Partial<Pick<UserTask, 'startDate' | 'endDate' | 'status' | 'notes'>>) => {
    setUserTasks(prev => {
      const updated = prev.map(ut => {
        if (ut.id === assignmentId) {
          const newStatus = updates.status || ut.status;
          // Auto-set dates based on status if not provided
          let startDate = updates.startDate !== undefined ? updates.startDate : ut.startDate;
          let endDate = updates.endDate !== undefined ? updates.endDate : ut.endDate;
          
          if (newStatus === 'IN_PROGRESS' && !startDate) {
            startDate = new Date().toISOString().split('T')[0];
          }
          if (newStatus === 'COMPLETED' && !endDate) {
            endDate = new Date().toISOString().split('T')[0];
          }
          if (newStatus === 'NOT_STARTED') {
            startDate = undefined;
            endDate = undefined;
          }

          return { 
            ...ut, 
            ...updates, 
            startDate, 
            endDate,
            updatedAt: new Date().toISOString() 
          };
        }
        return ut;
      });
      db.saveUserTasks(updated);
      return updated;
    });
  }, []);

  return {
    users,
    tasks,
    userTasks,
    currentUser,
    userTasksWithDetails,
    globalStats,
    isInitialized,
    login,
    logout,
    addUser,
    deleteUser,
    createTask,
    deleteTask,
    assignTask,
    updateTaskProgress
  };
}
