import express from "express";
import cors from 'cors';
import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcryptjs';
import { createServer } from 'http';
import { Server } from 'socket.io';

// --- INITIAL SETUP ---
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Create the HTTP server and pass the Express app to it
const httpServer = createServer(app);

// Initialize Socket.IO and attach it to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- SOCKET.IO CONNECTION HANDLER ---
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);
  socket.on('joinProject', (projectId) => {
    socket.join(projectId);
    console.log(`Client ${socket.id} joined project room ${projectId}`);
  });
  socket.on('disconnect', () => {
    console.log(`👋 Client disconnected: ${socket.id}`);
  });
});

// --- ROUTES (Your existing code is perfect here) ---

app.get('/', (req, res) => {
  res.send('TaskFlow Backend is running yay!')
});

app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) { return res.status(400).json({ message: 'All fields are required' }); }
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) { return res.status(409).json({ message: 'User with this email already exists' }); }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hashedPassword, name } });
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'An error occurred during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { return res.status(400).json({ message: 'Email and password are required' }); }
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { return res.status(401).json({ message: 'Invalid credentials' }); }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) { return res.status(401).json({ message: 'Invalid credentials' }); }
    const { password: _, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'An error occurred during login' });
  }
});

app.post('/api/projects', async (req, res) => {
  const { name, authorId } = req.body;
  if (!name || !authorId) { return res.status(400).json({ message: 'Project name and authorId are required' }); }
  try {
    const newProject = await prisma.project.create({ data: { name, authorId: authorId } });
    io.emit('project: created', newProject);
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ message: 'Failed to create project' });
  }
});

app.get('/api/projects/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) { return res.status(400).json({ message: 'User ID is required' }); }
  try {
    const projects = await prisma.project.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' } });
    res.status(200).json(projects);
  } catch (error) {
    console.error('Failed to get projects:', error);
    res.status(500).json({ message: 'Failed to get projects' });
  }
});

app.patch('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { name } = req.body;
  if (!name) { return res.status(400).json({ message: 'Project name is required' }); }
  try {
    const updatedProject = await prisma.project.update({ where: { id: projectId }, data: { name } });
    io.emit('project:updated', updatedProject);
    res.status(200).json(updatedProject);
  } catch (error) {
    console.error('Failed to update project', error);
    res.status(500).json({ message: 'Failed to update project' });
  }
});

app.delete('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  try {
    await prisma.project.delete({ where: { id: projectId } });
    io.emit('project:deleted', { id: projectId });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

app.get('/api/projects/:projectId/boards', async (req, res) => {
  const { projectId } = req.params;
  try {
    const boards = await prisma.board.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
    res.status(200).json(boards);
  } catch (error) {
    console.error('Failed to get boards', error);
    res.status(500).json({ message: 'Failed to get Boards' });
  }
});

app.post('/api/projects/:projectId/boards', async (req, res) => {
  const { projectId } = req.params;
  const { name } = req.body;
  if (!name) { return res.status(400).json({ message: 'Board name is required' }); }
  try {
    const lastBoard = await prisma.board.findFirst({ where: { projectId }, orderBy: { order: 'desc' } });
    const newOrder = lastBoard ? lastBoard.order + 1 : 0;
    const newBoard = await prisma.board.create({ data: { name, projectId, order: newOrder } });
    io.to(projectId).emit('board:created', newBoard);
    res.status(201).json(newBoard);
  } catch (error) {
    console.error('Failed to create new board');
    res.status(500).json({ message: 'Failed to create board' });
  }
});

app.patch('/api/boards/:boardId', async (req, res) => {
  const { boardId } = req.params;
  const { name } = req.body;
  if (!name) { return res.status(400).json({ message: 'Board name is required' }); }
  try {
    const updatedBoard = await prisma.board.update({ where: { id: boardId }, data: { name } });
    res.status(200).json(updatedBoard);
  } catch (error) {
    console.error('Failed to update board:', error);
    res.status(500).json({ message: 'Failed to update board' });
  }
});

app.delete('/api/boards/:boardId', async (req, res) => {
  const { boardId } = req.params;
  try {
    await prisma.board.delete({ where: { id: boardId } });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete board:', error);
    res.status(500).json({ message: 'Failed to delete board' });
  }
});

app.get('/api/boards/:boardId/tasks', async (req, res) => {
  const { boardId } = req.params;
  try {
    const tasks = await prisma.task.findMany({ where: { boardId }, orderBy: { order: 'asc' } });
    res.status(200).json(tasks);
  } catch (error) {
    console.error('Failed to get tasks:', error);
    res.status(500).json({ message: 'Failed to get tasks' });
  }
});

app.post('/api/boards/:boardId/tasks', async (req, res) => {
  const { boardId } = req.params;
  const { title, description } = req.body;
  if (!title) { return res.status(400).json({ message: 'Task title is required' }); }
  try {
    const lastTask = await prisma.task.findFirst({ where: { boardId }, orderBy: { order: 'desc' } });
    const newOrder = lastTask ? lastTask.order + 1 : 0;
    const newTask = await prisma.task.create({ data: { title, description: description || null, boardId, order: newOrder } });
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Failed to create task:', error);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

app.patch('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { title, description } = req.body;
  try {
    const updatedTask = await prisma.task.update({ where: { id: taskId }, data: { ...(title && { title }), ...(description !== undefined && { description }) } });
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error('Failed to update task:', error);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  try {
    await prisma.task.delete({ where: { id: taskId } });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete task:', error);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

app.post('/api/tasks/reorder', async (req, res) => {
  const { boardId, orderedTasks } = req.body;
  if (!boardId || !Array.isArray(orderedTasks)) { return res.status(400).json({ message: 'Board ID and an array of ordered tasks are required.' }); }
  try {
    if (orderedTasks.length === 0) { return res.status(200).json({ message: 'No tasks to reorder.' }); }
    const updatePromises = orderedTasks.map((task, index) => {
      if (!task || !task.id) { throw new Error('Invalid task data provided.'); }
      return prisma.task.update({ where: { id: task.id }, data: { order: index, boardId: boardId } });
    });
    await prisma.$transaction(updatePromises);
    res.status(200).json({ message: 'Tasks reordered successfully' });
  } catch (error: any) {
    console.error('--- FAILED TO REORDER TASKS (POST) ---');
    console.error('Error during transaction:', error.message);
    if (error.code) { console.error('Prisma Error Code:', error.code); }
    console.error('---------------------------------');
    res.status(500).json({ message: 'Failed to reorder tasks' });
  }
});

// --- SERVER START ----

// REAL-TIME FIX: We must start the httpServer that Socket.IO is attached to,
// NOT the original Express app.
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
