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


// --- SERVER START ----

app.listen(PORT, ()=>{
  console.log(`Server is running on http://localhost:${PORT}`);

})