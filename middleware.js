import express from "express";
import pg from "pg";
import lodash from 'lodash';
import dotenv from "dotenv";
import morgan from 'morgan';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const app = express();
const port = 5000;

// --- DB Connection (Keep at top) ---
const db = new pg.Pool({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    },
});
db.connect();

// --- Logging Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
);
const errorLogStream = fs.createWriteStream(
    path.join(logsDir, 'errors.log'),
    { flags: 'a' }
);

// Initial writes to confirm streams are open
accessLogStream.write('=== ACCESS LOGGING STARTED ===\n');
errorLogStream.write('=== ERROR LOGGING STARTED ===\n');

// --- Middleware Chain Order (CRITICAL) ---

// 1. Body Parsers - MUST come before any middleware that needs req.body
app.use(express.json());       // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// 2. Morgan for general request logging (Optional - only if you want *both* morgan and custom logs)
// If you want ONLY your custom JSON log, remove this morgan line.
app.use(morgan('combined', {
    stream: accessLogStream,
    immediate: true // Log immediately for general request info
}));

// 3. Custom Middleware for Request and Response Body Logging (MODIFIED)
// This must come AFTER body parsers but BEFORE your actual routes
app.use((req, res, next) => {
    // Capture Request Details with limited fields
    const requestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl, // Full URL
        body: req.body,       // This will contain the parsed request body
        client_ip: req.ip,    // Client IP address
        user_agent: req.headers['user-agent'] // User-Agent header
    };

    const originalSend = res.send;
    const originalJson = res.json;

    // Intercept res.send()
    res.send = function (body) {
        let responseBodyParsed = null;
        try {
            if (typeof body === 'string' && body.trim().startsWith('{') && body.trim().endsWith('}')) {
                responseBodyParsed = JSON.parse(body);
            } else {
                responseBodyParsed = body;
            }
        } catch (e) {
            responseBodyParsed = body;
        }

        // Capture Response Details with limited fields
        const responseLog = {
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            body: responseBodyParsed
        };

        const fullLogEntry = {
            request: requestLog,
            response: responseLog
        };
        accessLogStream.write(JSON.stringify(fullLogEntry) + '\n');

        originalSend.call(this, body);
    };

    // Intercept res.json()
    res.json = function (body) {
        // Capture Response Details with limited fields
        const responseLog = {
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            body: body
        };

        const fullLogEntry = {
            request: requestLog,
            response: responseLog
        };
        accessLogStream.write(JSON.stringify(fullLogEntry) + '\n');

        originalJson.call(this, body);
    };

    console.log('Custom logging middleware hit');
    next();
});

// --- Your API Routes ---
app.get("/", (req, res) => {
    res.send('API is running!');
});

app.post("/auth", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({
            message: "Username and Password are required"
        });
    } else {
        try {
            const results = await db.query("SELECT * FROM all_profiles WHERE username = $1",
                [username.toLowerCase()]
            );

            if (results.rows.length > 0) {
                const profile = results.rows[0];

                if (password === profile.password) {
                    const first_namev = lodash.capitalize(profile.first_name);
                    res.status(200).json({
                        message: "Login Successful",
                        profile: {
                            id: profile.uniqueid,
                            username: profile.username,
                            first_name: first_namev,
                            middle_name: profile.middle_name,
                            last_name: profile.last_name,
                            email: profile.email_address,
                            role: profile.priviledge
                        },
                    });
                } else {
                    res.status(401).json({
                        message: "Incorrect Password"
                    })
                }
            } else {
                res.status(401).json({
                    message: "Username not found",
                });
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({
                message: "Something went wrong",
                error_type: err.message
            });
        };
    };
});

app.post("/register", async (req, res) => {
    const { username, first_name, middle_name, last_name, password, email, role } = req.body;
    if (!username || !first_name || !last_name || !password || !email) {
        res.status(400).json({
            message: "Kindly fill the required details (username, first_name, last_name, password, email, role)"
        });
    } else {
        try {
            const query = `INSERT INTO all_profiles (username, first_name, middle_name, last_name, password, email_address, priviledge)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING uniqueid`;

            const values = [username.toLowerCase(), first_name, middle_name, last_name, password, email.toLowerCase(), role];

            const result = await db.query(query, values);

            res.status(201).json({
                message: "User registered Successfully!",
                userId: result.rows[0].uniqueid,
            });
        } catch (err) {
            if (err.code === '23505') {
                res.status(409).json({
                    message: "Username or email already exists. Please choose another username or password"
                });
            } else {
                console.error(err);
                res.status(500).json({
                    message: "Something went wrong",
                    error_type: err.message
                });
            }
        };
    };
});

app.post("/fetch_questions", async (req, res) => {
    const { category } = req.body;
    if (!category) {
        res.status(400).json({
            message: "No category is selected"
        })
    } else {
        try {
            const result = await db.query("SELECT * FROM questions WHERE category = $1 ORDER BY RANDOM () lIMIT 1",
                [category]
            );

            if (result.rows.length === 0) {
                res.status(404).json({
                    message: "No questions found for this category"
                });
            } else {
                const question = result.rows[0];
                res.status(200).json({
                    message: "Successfully fetched record",
                    category: question.category,
                    question: question.question,
                    options: {
                        A: question.optiona,
                        B: question.optionb,
                        C: question.optionc,
                        D: question.optiond,
                        E: question.optione,
                    },
                    answer: question.answer,
                });
            }
        } catch (err) {
            console.error("Error fetching question:", err);
            return res.status(500).json({
                message: "Server error"
            })
        }
    }
});

// --- Error Handling Middleware (Always last, before app.listen) ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    errorLogStream.write(`[${new Date().toISOString()}] UNHANDLED ERROR: ${err.message}\n${err.stack}\n`);
    res.status(500).send('Something broke!');
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Access logs will be written to: ${path.join(logsDir, 'access.log')}`);
    console.log(`Error logs will be written to: ${path.join(logsDir, 'errors.log')}`);
});

// --- Handle process exit to close streams properly ---
process.on('SIGINT', () => {
    console.log('SIGINT signal received. Closing log streams...');
    accessLogStream.end(() => {
        console.log('access.log stream closed.');
    });
    errorLogStream.end(() => {
        console.log('errors.log stream closed.');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Closing log streams...');
    accessLogStream.end(() => {
        console.log('access.log stream closed.');
    });
    errorLogStream.end(() => {
        console.log('errors.log stream closed.');
        process.exit(0);
    });
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    errorLogStream.write(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    errorLogStream.write(`[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`);
});