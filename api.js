import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import test from "node:test";


const app = express();
const port = 5000;

//configure db details

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "exams",
    password: "ola1234",
    port: 5432,
});
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
            const results = await db.query("SELECT * FROM profiles WHERE user_name = $1",
                [username.toLowerCase()]
            
            );

            if (results.rows.length > 0) {
                const profile = results.rows[0];

                if (password === profile.password){
                    res.status(200).json({
                        message: "Login Successful",
                        profile: {
                            id: profile.uniqueid,
                            username: profile.user_name,
                            first_name: profile.first_name,
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
                    message: "Incorrect Username",
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
            const query = `INSERT INTO profiles (user_name, first_name, middle_name, last_name, password, email_address, priviledge) 
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


app.listen(port, ()=>{
    console.log(`Server is running on port ${port}.`);
})