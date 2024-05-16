"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginHandler = exports.authMiddleware = void 0;
const users = {
    user1: 'password1',
    user2: 'password2',
};
const authMiddleware = (req, res, next) => {
    if (req.session && req.session.loggedIn) {
        return next();
    }
    else {
        res.status(401).send('Unauthorized');
    }
};
exports.authMiddleware = authMiddleware;
const loginHandler = (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username] === password) {
        req.session.loggedIn = true;
        res.send('Login successful');
    }
    else {
        res.status(401).send('Invalid credentials');
    }
};
exports.loginHandler = loginHandler;
