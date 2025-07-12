import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import test from "node:test";
import { Pool } from 'pg';
import lodash from 'lodash';
import dotenv from "dotenv";
dotenv.config();



const app = express();
const port = 5000;

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


app.listen(port, ()=>{
    console.log(`Server is running on port ${port}.`);
})

