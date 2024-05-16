import { Request, Response, NextFunction } from 'express';
import session, { Session } from 'express-session';

// Extend the Session interface
declare module 'express-session' {
  interface Session {
    loggedIn?: boolean;
  }
}

const users: { [key: string]: string } = {
  user1: 'password1',
  user2: 'password2',
};

interface LoginRequestBody {
  username: string;
  password: string;
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.session && req.session.loggedIn) {
    return next();
  } else {
    res.status(401).send('Unauthorized');
  }
};

export const loginHandler = (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    req.session.loggedIn = true;
    res.send('Login successful');
  } else {
    res.status(401).send('Invalid credentials');
  }
};