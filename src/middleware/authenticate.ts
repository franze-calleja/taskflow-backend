import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extent the Express Resquest type to include our user payload
export interface AuthenticatedRequest extends Request{
  user?: {
    id:string;
  };
}


export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) =>{
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  

  if (token == null){
    return res.sendStatus(401); // Unathorized
  }

  // The NEXTAUTH_SECRET must match the one used in the frontend .env.local file!
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret){
    console.error("NEXTAUTH_SECRET is not set in the environment variables.")
    return res.sendStatus(500);
  }

  jwt.verify(token, secret, (err: any, user: any) =>{
    if(err){
      console.error("JWT Verification Error:", err.message);
      return res.sendStatus(403); //FOrbidden
    }

    // THe decoded user payload from the JWT is attached to the request object
    // The payload contains what we put in the `jwt` callback in NextAuth options
    req.user = {id: user.id};

    next();
  })

}


