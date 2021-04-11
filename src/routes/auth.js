const express = require('express');
const router = express.Router();
const jwt = require("jsonwebtoken");
const mysql = require('mysql');
const { json } = require('express');
const cookie = require('cookie');
const { token } = require('morgan');

const allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', process.env.APP_URL);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    // res.header('Access-Control-Allow-Credentials', true);
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, access_token'
    );
  
    // intercept OPTIONS method
    if ('OPTIONS' === req.method) {
      res.send(200);
    } else {
      next();
    }
}

router.use(allowCrossDomain);

// 鍵の設定
const PRIVATE_KEY = process.env.PRIVATE_KEY;
// MYSQLに接続
const con = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    // port: process.env.MYSQL_PORT,
    database: process.env.MYSQL_DATABASE
});

// 新規アカウント作成の処理
router.post('/signup', (req, res) => {
    const user_name = req.body.name;
    const password = req.body.password;
    con.connect((err) => {
        const selectSql = "SELECT * FROM user WHERE name = ?";
        con.query(selectSql, [user_name], (err, result, fields) => {
            if(result.length) {
                res.status(422).json({
                    error: 'alredy exist!'
                });
            } else {
                const insertSql = "INSERT INTO user (name, password) VALUES (?, ?)";
                con.query(insertSql, [user_name, password], (err, result, fields) => {
                    // jwt発行
                    const payload = {
                        user_id: result.insertId
                    };
                    const option = {
                        expiresIn: '1h'
                    };
                    jwt.sign(payload,PRIVATE_KEY,option,(err, token) => {
                        // res.cookie('token', token, { httpOnly: true });
                        res.status(200).json({
                        user_id: result.insertId,
                        token: token,
                        });
                    });
                });
            }
        })
    });
});

// ログイン処理
router.post('/login',(req, res) => {
    const user_name = req.body.name;
    const password = req.body.password;
    const sql = "SELECT * FROM user WHERE name=? AND password=?";
    con.connect((err) => {
        con.query(sql,[user_name,password],(err, result, fields) => {
            if(!result.length) {
                res.status(404).json({
                    error: 'not found account!!'
                });
            } else {
                // jwt発行
                const payload = {
                    user_id: result[0].id
                };
                const option = {
                    expiresIn: '1h'
                };
                jwt.sign(payload,PRIVATE_KEY,option,(err, token) => {
                    // res.cookie('token', token, { httpOnly: true});
                    res.status(200).json({
                        user_id: result[0].id,
                        token: token,
                    });
                });
            }
        });
    });
});

// token確認ミドルウェア(jwtをcookieでhttpOnlyな値として扱う場合)
// const auth = (req, res, next) => {
//     const token = req.cookies.token;
//     if(token) {
//         //トークンの検証
//         jwt.verify(token, PRIVATE_KEY, function(err, decoded) {
//             if (err) {
//                 return res.status(403).json({
//                     error: 'Invalid token'
//                 });
//             } else {
//                 req.decoded = decoded;
//                 next();
//             }
//         });
//     } else {
//         return res.status(404).json(null).json({
//             error: 'Not provided token!'
//         });
//     }
// }

// 認証用ミドルウェア(jwtをリクエストヘッダのauthorizationにBearerスキームで送られてくる場合)
const auth = (req, res, next) => {
    // リクエストヘッダーからトークンの取得
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        const token = req.headers.authorization.split(' ')[1];
        if (!token) {
            return res.status(404).send({
            message: "No token provided!",
            token: token
        });
        }
        // トークンの検証
        jwt.verify(token, PRIVATE_KEY, function(err, decoded) {
            if (err) {
                // 認証NGの場合
                return res.status(403).json({
                    error: 'Invalid token'
                });
            } else {
                // 認証OKの場合
                req.decoded = decoded;
                next();
            }
        });
    } else {
        return res.status(404).json({
            error: 'Not provided token!'
        });;
    }
}


// ユーザー情報確認
router.get('/me',auth,(req, res) => {
    res.status(200).json({
        message: `your id is ${req.decoded.user_id}`,
        user_id: req.decoded.user_id
    });
});

//ログアウトの処理
// router.get('/logout', auth, (req, res) => {
//     res.clearCookie('token');
//     res.status(200).json({
//         message: 'logout!!'
//     })
// });

// 記事を投稿する処理
router.post('/postArticle',auth,(req, res) => {
    const sql = `INSERT INTO blog (title, body, user_id) VALUES (?, ?, ?)`;
    con.connect((err) => {
        con.query(sql,[req.body.title, req.body.data, req.decoded.user_id] ,(err, result, fields) => {
            if(err) {
                res.json({
                    error: 'failed post'
                }); 
            } else {
                res.json({
                    result: result
                });
            }
        });
    });
});

// コメントを投稿する処理
router.post('/postComment' , auth, (req, res) => {
    const sql = `INSERT INTO comment ( text, user_id, blog_id) VALUES ( ?, ?, ?)`;
    con.connect((err) => {
        con.query(sql,[req.body.text, req.decoded.user_id, req.body.blog_id] ,(err, result, fields) => {
            if(err) {
                res.json({
                    error: 'failed post'
                }); 
            } else {
                res.json({
                    result: result
                });
            }
        });
    });
})

// コメントを取り出す処理  
router.get('/comment/:id', (req, res) => {
    con.connect((err) => {
        const sql = "SELECT  comment.id,comment.user_id ,text,comment.created , name FROM comment , user WHERE comment.blog_id=? AND comment.user_id=user.id"
        con.query(sql,[req.params.id], (err,result, fields) => {
            if(!result.length) {
                res.status(404).json({
                    error: 'not found article!!'
                });
            }else {
                res.status(200).json({
                    results: result
                });
            }
        })
    })
})

//コメントを削除する処理  
router.delete('/comment',auth, (req, res) => {
    con.connect((err) => {
        const sql = "DELETE FROM comment WHERE id=?"
        con.query(sql ,[req.body.id], (err,result, fields) => {
            if(result.affectedRows === 0) {
                res.status(404).json({
                    error: 'not found comment!!'
                });
            } else {
                res.status(200).json({
                    message: "delete!!"
                })
            }
        })
    })
})

// 記事を全て取り出す処理
router.get('/blogs', (req, res) => {
    con.connect((err) => {
        const sql = "SELECT blog.id, title, body, name FROM blog, user WHERE blog.user_id=user.id ORDER BY id DESC";
        con.query(sql, (err, result, fields) => {
            res.json({
                results: result
            });
        });
    });
});

// 記事を1つ取り出す処理
router.get('/blogs/:id', (req, res) => {
    con.connect((err) => {
        const sql = "SELECT * FROM blog WHERE id=?"
        con.query(sql,[req.params.id], (err,result, fields) => {
            if(!result.length) {
                res.status(404).json({
                    error: 'not found article!!'
                });
            }else {
                res.status(200).json({
                    results: result
                });
            }
        })
    })
})

// 記事を削除する処理
router.get('/delete/:id' , auth, (req, res) => {
    con.connect((err) => {
        const sql = "DELETE FROM blog WHERE id=?";
        con.query(sql,[req.params.id] ,(err, result ,fields) => {
            res.status(200).json({
                message: 'deleted!'
            });
        });
    });
});

module.exports = router;
