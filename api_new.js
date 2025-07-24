import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import test from "node:test";
import { Pool } from 'pg';
import lodash from 'lodash';
import dotenv from "dotenv";
import morgan from 'morgan';
import fs from 'fs';
import { dirname, join} from 'path';
import { fileURLToPath } from 'url';
import path from 'path'



dotenv.config();



const app = express();
const port = 5000;

// const Middleware = (req, res, next) =>{
//     console.log('Middleware is running');
//     next();
// }

// app.use(Middleware);

// //configure db details
// console.log("Password:", process.env.password);
// console.log("user:", process.env.user);

const db = new pg.Pool({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    },
    
} );


// const db = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: false,
// });


db.connect();

app.use(bodyParser.json());

app.get("/", (req, res) =>{
        
});

app.post("/auth", async (req, res) =>{
    const {username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            message: "Username and Password are required"
        });
    } else {

        try{ 
            const results = await db.query("SELECT * FROM all_profiles WHERE username = $1",
                [username.toLowerCase()]
            
            );

            if (results.rows.length > 0) {
                const profile = results.rows[0];

                if (password === profile.password){

                    //if the firstname is stored in small letters, or capital letter, turn jost the first letter to capiat letter
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

       

        }catch (err) {

            console.error(err);
            res.status(500).json({
                message: "Something went wrong",
                error_type: err.message

            });

        };
    };


    
});

app.post("/register", async (req, res) =>{
    const {username, first_name, middle_name, last_name, password, email, role} = req.body;

    if (!username || !first_name || !last_name || !password || !email){
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
        } catch (err){

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


app.post("/fetch_questions", async(req, res) =>{
    const {category} = req.body;

    if (!category) {
        res.status(400).json({
            message: "No category is selected"
        })
    } else {
        try {
            const result = await db.query("SELECT * FROM questions WHERE category = $1 ORDER BY RANDOM () lIMIT 1",
                [category]
            );

            if (result.rows === 0){
                res.status(404).json({
                    message: "No questions found for this category"
                });
                
            }
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
            

                
        } catch(err){
            console.error("Error fetching question:", err);
            return res.status(500).json({
                message: "Server error"
            })

        }
    }


});

//create a write stream
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define logs directory path
const logsDir = path.join(__dirname, 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    {flags: 'a'}

);

const errorLogStream = fs.createWriteStream(
  path.join(logsDir, 'errors.log'),
  { flags: 'a' }
);

// 4. Verify streams are writable
accessLogStream.write('=== LOGGING STARTED ===\n');
errorLogStream.write('=== ERROR LOGGING STARTED ===\n');


// --- 2. Body Parsers (ESSENTIAL for logging request bodies) ---
// These must come BEFORE your custom logging middleware if you want to log request bodies
app.use(express.json());       // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// --- 3. Custom Middleware for Request and Response Body Logging ---
app.use((req, res, next) => {
    // Capture Request Details
    const requestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: req.body // This will contain the parsed request body
    };

    // Store original send/json functions
    const originalSend = res.send;
    const originalJson = res.json;

    // Intercept res.send()
    res.send = function (body) {
        const responseLog = {
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body: body ? JSON.parse(body) : null // Parse body if it's JSON string
        };

        // Log the complete transaction
        const fullLogEntry = {
            request: requestLog,
            response: responseLog
        };
        // Write to a dedicated API log stream or the accessLogStream
        accessLogStream.write(JSON.stringify(fullLogEntry) + '\n');

        // Call the original send to actually send the response
        originalSend.call(this, body);
    };

    // Intercept res.json()
    res.json = function (body) {
        const responseLog = {
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body: body // This will contain the JSON object
        };

        // Log the complete transaction
        const fullLogEntry = {
            request: requestLog,
            response: responseLog
        };
        // Write to a dedicated API log stream or the accessLogStream
        accessLogStream.write(JSON.stringify(fullLogEntry) + '\n');

        // Call the original json to actually send the response
        originalJson.call(this, body);
    };

    // This console.log will confirm the middleware is hit
    console.log('Custom logging middleware hit');

    next(); // Pass control to the next middleware or route handler
});


// --- Example Routes (To test logging) ---
app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/api/data', (req, res) => {
    console.log('Received data:', req.body); // Check if body is parsed here
    res.json({ message: 'Data received', yourData: req.body });
});

app.get('/error-test', (req, res) => {
    try {
        throw new Error('This is a test error!');
    } catch (err) {
        errorLogStream.write(`[${new Date().toISOString()}] ERROR: ${err.message}\n${err.stack}\n`);
        res.status(500).send('An error occurred');
    }
});


// --- Error Handling Middleware (Always last) ---
app.use((err, req, res, next) => {
    console.error(err.stack); // Log to console for immediate visibility
    errorLogStream.write(`[${new Date().toISOString()}] UNHANDLED ERROR: ${err.message}\n${err.stack}\n`);
    res.status(500).send('Something broke!');
});


// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // These initial writes confirm stream health
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
        process.exit(0); // Exit after all streams are closed
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

// Catch uncaught exceptions to prevent process from crashing
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    errorLogStream.write(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n`);
    // It's often recommended to exit after uncaught exceptions for process stability
    // process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    errorLogStream.write(`[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`);
    // process.exit(1);
});


// // 5. Use explicit morgan format
// app.use(morgan('combined', {
//   stream: accessLogStream,
//   // Ensure it logs immediately rather than buffering
//   immediate: true
// }));

// // 6. Add middleware to verify logging
// app.use((req, res, next) => {
//   console.log('Request received - should be logged'); // Verify in console
//   next();
// });

// // 7. Handle process exit to close streams properly
// process.on('SIGINT', () => {
//   accessLogStream.end();
//   errorLogStream.end();
//   process.exit();
// });


// app.listen(port, ()=>{
//     console.log(`Server is running on port ${port}.`);
// })

// 