import express  from "express";
import cors from 'cors';
import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcryptjs';
import { AuthenticatedRequest, authenticateToken } from "./middleware/authenticate";


// --- INITIAL SETUP ---
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// --- MIDDLEWARE ---
// Enable CORS for all routes
app.use(cors());
// Enable express to parse JSON in request bodies
app.use(express.json());

// ROUTES

app.get('/', (req, res) =>{
  res.send('TaskFlow Backend is running yay!')
})

/**
 * Route to handle new user registration
 */
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;

  // Basic validation
  if (!email || !password || !name) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    // Hash the password for security
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user in the database
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    // Don't send the password back, even the hashed one
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'An error occurred during registration' });
  }
});

/**
 * Route to handle user login
 */

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Find the user by their email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't specify whether the email or password was wrong for security
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // If login is successful, return the user object (without the password)
    const { password: _, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'An error occurred during login' });
  }
});


// --- PROJECT ROUTES

/**
 * Route to create a new project.
 * This is now an "insecure" route, trusting the userId from the request body.
 */
app.post('/api/projects', async (req, res) => {
  const { name, authorId } = req.body; // Get authorId from the body

  if (!name || !authorId) {
    return res.status(400).json({ message: 'Project name and authorId are required' });
  }

  try {
    const newProject = await prisma.project.create({
      data: {
        name,
        authorId: authorId,
      },
    });
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ message: 'Failed to create project' });
  }
});


/**
 * Route to get all projects for a specific user.
 */
app.get('/api/projects/:userId', async (req, res) => {
  const { userId } = req.params; // Get userId from the URL parameters

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const projects = await prisma.project.findMany({
      where: {
        authorId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.status(200).json(projects);
  } catch (error) {
    console.error('Failed to get projects:', error);
    res.status(500).json({ message: 'Failed to get projects' });
  }
});

/**
 * Route to update a project's name.
 */
app.patch('/api/projects/:projectId', async (req, res) => {
  const {projectId} = req.params;
  const {name} = req.body;

  if (!name){
    return res.status(400).json({message: 'Project name is required'});
  }

  try {
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: { name },
    })
    res.status(200).json(updatedProject)
  } catch (error) {
    console.error('Failed to update project', error);
    res.status(500).json({message: 'Failed to update project'});
    
  }
});

/**
 * Route to delete a project.
 * Note: Thanks to our schema's `onDelete: Cascade` for boards,
 * deleting a project will automatically delete all its boards,
 * and deleting those boards will automatically delete all their tasks.
 */
app.delete('/api/projects/:projectId', async (req, res) => {
  const {projectId} = req.params;

  try {
    await prisma.project.delete({
      where: {id: projectId},

    });
    res.status(204).send(); // 204 No Content is standard for a successful delete
  } catch (error) {
     console.error('Failed to delete project:', error);
    res.status(500).json({ message: 'Failed to delete project' });
  }
})

// --- BOARD ROUTES ---

/**
 * Route to get all boards for a specific project.
 */
app.get('/api/projects/:projectId/boards', async (req, res) =>{
  const {projectId} = req.params;

  try{
    const boards = await prisma.board.findMany({
      where: { projectId },
      orderBy: { order: 'asc' }, // Order boards by their 'order' field
    });
    res.status(200).json(boards);
  }catch(error){
    console.error('Failed to get boards', error);
    res.status(500).json({message: 'Failed to get Boards'});
  }
});

/**
 * Route to create a new board within a project.
 */
app.post('/api/projects/:projectId/boards', async (req, res) => {
  const {projectId} = req.params;
  const {name} = req.body;

  if (!name){
    return res.status(400).json({message: 'Board name is required'});
  }

  try {
    // Find the highest 'order' value for existing boards in this project
    const lastBoard = await prisma.board.findFirst({
      where: {projectId},
      orderBy: {order: 'desc'},
    })
     const newOrder = lastBoard ? lastBoard.order + 1: 0;
     const newBoard = await prisma.board.create({
      data: {
        name, 
        projectId,
        order: newOrder,
      },
     });
     res.status(201).json(newBoard);
  } catch (error) {
    console.error('Failed to create new board');
    res.status(500).json({message: 'Failed to create board'});
  }
})

/**
 * Route to update a board's name.
 */
app.patch('/api/boards/:boardId', async (req, res) => {
  const { boardId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Board name is required' });
  }

  try {
    const updatedBoard = await prisma.board.update({
      where: { id: boardId },
      data: { name },
    });
    res.status(200).json(updatedBoard);
  } catch (error) {
    console.error('Failed to update board:', error);
    res.status(500).json({ message: 'Failed to update board' });
  }
});

/**
 * Route to delete a board.
 * This will also delete all tasks within this board due to cascading deletes.
 */
app.delete('/api/boards/:boardId', async (req, res) => {
  const { boardId } = req.params;

  try {
    await prisma.board.delete({
      where: { id: boardId },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete board:', error);
    res.status(500).json({ message: 'Failed to delete board' });
  }
});


// --- TASK ROUTES ---

/**
 * Route to get all tasks for a specific board.
 */
app.get('/api/boards/:boardId/tasks', async (req, res) => {
  const { boardId } = req.params;
  try{
    const tasks = await prisma.task.findMany({
    where: {boardId},
    orderBy: {order: 'asc'}
  });
  res.status(200).json(tasks);
  }catch(error){
    console.error('Failed to get tasks:', error);
    res.status(500).json({ message: 'Failed to get tasks' });

  }
  
})

/**
 * Route to create a new task within a board.
 */
app.post('/api/boards/:boardId/tasks', async (req, res) => {
  const { boardId} = req.params;
  const {title, description} = req.body;

  if (!title){
    return res.status(400).json({message: 'Task title is required'});
  }

  try {
    // Find the highest 'order' value for existing tasks in this board
    const lastTask = await prisma.task.findFirst({
      where: { boardId },
      orderBy: { order: 'desc' },
    });

    const newOrder = lastTask ? lastTask.order + 1: 0;

    const newTask = await prisma.task.create({
      data:{
        title,
        description: description || null,
        boardId,
        order: newOrder,
      },
    })
    res.status(201).json(newTask);

  }catch(error){
    console.error('Failed to create task:', error);
    res.status(500).json({ message: 'Failed to create task' });

  }
})


/**
 * Route to update a task's title or description.
 */
app.patch('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { title, description } = req.body;

  try {
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        // Only update fields that are provided in the request
        ...(title && { title }),
        ...(description !== undefined && { description }),
      },
    });
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error('Failed to update task:', error);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

/**
 * Route to delete a task.
 */
app.delete('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;

  try {
    await prisma.task.delete({
      where: { id: taskId },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete task:', error);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

/**
 * Route to handle updating the order of tasks within a board,
 * or moving a task to a new board.
 */
app.patch('/api/task/reorder', async (req, res) => {
  const {boardId, orderedTasks } = req.body;
  // orderedTasks is expected to be an array of task objects with at least an id property.
  // e.g., [{ id: 'task1', ... }, { id: 'task2', ... }]

  if (!boardId || !Array.isArray(orderedTasks)){
    return res.status(400).json({message: 'Board ID and an array of ordered task are required'})
  }

  try {
    // We'll use a transaction to ensure all updates succeed or fail together.
    // This is crucial for data integrity.
    const updatePromises = orderedTasks.map((task, index) => {
      return prisma.task.update({
        where: {id: task.id},
        data: {
          order: index,
          boardId: boardId, // Ensure the task is associated with the correct board
        }
      })
    });
    // Execute all update operations in a single transaction
    await prisma.$transaction(updatePromises);

    res.status(200).json({message: 'Tasks reordered succesfully'})
  } catch (error) {
    console.error('Failed to reorder tasks:', error);
    res.status(500).json({ message: 'Failed to reorder tasks' });
  }

});


// --- SERVER START ----

app.listen(PORT, ()=>{
  console.log(`Server is running on http://localhost:${PORT}`);

})