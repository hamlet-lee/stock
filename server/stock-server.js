var uuid = require('node-uuid');
var dateFormat = require('dateformat');
var mysql      = require('mysql');
var request = require('request');
var iconv = require('iconv-lite');
var CronJob = require('cron').CronJob;
var format = require('string-template');
var session = require('express-session');
var crypto = require('crypto');
var MySQLStore = require('express-mysql-session')(session);

var jsonfile = require('jsonfile')
var file = 'conf.json'
var conf = jsonfile.readFileSync(file);
var poolSpec = conf.pool;
var stockListUrl = conf.stockListUrl;
console.log("read file" + JSON.stringify( poolSpec ));

var pool = mysql.createPool( poolSpec );
 
var express = require('express');
var app = express();

var sessionConf = conf.sessionConf;
sessionConf.store = new MySQLStore({}, pool);
app.use(session( sessionConf ));

// Authentication and Authorization Middleware
var auth = function(req, res, next) {
  if (req.session && req.session.user !== undefined)
    return next();
  else
    return res.sendStatus(401);
};

function getHash(orig){
  var md5sum = crypto.createHash('md5');
  md5sum.update(orig);
  var d = md5sum.digest('hex');
  console.log(d);
  return d;
}

//for create user
app.get('/newUser', function(req,res) {
  let username = req.query.username;
  let password = req.query.password;
  pool.query("insert into tbl_user (username, passhash) values (?,?)", [username, getHash(password)], (e,r) =>{
    if( e ){
      res.end("error " + JSON.stringify(e));
    }else{
      res.end("done");
    }
  });
});


// Logout endpoint
app.get('/logout', function (req, res) {
  req.session.destroy();
  res.send("logout success!");
});

// // Get content endpoint
// app.get('/content', auth, function (req, res) {
//     res.send("You can only see this after you've logged in." + req.session.user);
// });
 
var fs = require("fs");

var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data

function getDate(now){
  return dateFormat(now,'yyyy-mm-dd');
}

function genStk( code, rows ){
  //console.log(`code=${code}`);
  let high = Math.max.apply(null, rows.map( r => r.high ));
  //console.log(`high=${high}`);
  let low = Math.min.apply(null, rows.map( r => r.low) );
  let cur = rows[rows.length - 1].close;
  
  let highPos = rows.length - 1;
  while( highPos >= 0 ){
    if( rows[highPos].high == high ) {
      break;
    }
    highPos--;
  }
  
  let lowPos = rows.length - 1;
  while( lowPos >= 0 ){
    if( rows[lowPos].low == low) {
      break;
    }
    lowPos--;
  }

  let sumVol = 0;
  rows.forEach( r => sumVol += r.volume );
  
  let avgVol = sumVol / rows.length;
  let volLevel = rows[rows.length-1].volume / avgVol;
  let toHigh = rows.length - highPos;
  let toLow = rows.length - lowPos;
  
  return {
    code,
    high,
    low,
    toHigh,
    toLow,
    level: (cur - low) / (high - low),
    volLevel,
    sign: (toHigh > toLow ? 1: -1)
  };
}

function processCodeList(body){ 
  let re = /\.html">([^<>\(]+)\((\d+)\)</mg;
  let match;
  while( match = re.exec(body) ){
    console.log(`${match[1]} -> ${match[2]}`);
    pool.query("insert into tbl_code (code, name) values (?,?)", [ match[2], match[1]]);
  }
}

//processStockList(">abce(200552)<\n>eee(222222)<");
//end();
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded


// Login endpoint
app.post('/login', function (req, res) {
  console.log(req.body);
  if (!req.body.username || !req.body.password) {
    res.send('login failed');    
  } else {
    let {username, password, url } = req.body;
    console.log("username=" + username + " password=" + password);
    pool.query(
      "select count(*) as cnt from tbl_user where username=? and passhash=?", 
      [username, getHash(password)],
        (e,r) =>{
          if( e == undefined && r[0].cnt > 0) {
            req.session.user = username;
            if( url != undefined && url != "") {
              res.redirect(url);
            }else{
              res.end("login success!");
            }
          }else{
            res.end("login fail! e=" + JSON.stringify(e));
          }  
        }
      );
  }
});

//session
// app.use(function (req, res, next) {
//     var err = req.flash('error');
//     var success = req.flash('success');
//     res.locals({
//         user:req.session.user,
//         navSide:req.session.navSide,
//         error:err.length ? err : null,
//         success:success.length ? success : null
//     });
//     next();
// });

//登录拦截器
var auth = function (req, res, next) {
    var url = req.originalUrl;
    if (url.indexOf("/login") < 0 && !req.session.user) {
        return res.redirect("/login.html?url=" + encodeURIComponent(url));
    }
    next();
};

app.use(auth);

app.use(express.static('client'));

app.get('/updateStockList',
  function (req, res){
    let url = stockListUrl;
    request({uri: url, encoding: null}, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        body =  iconv.decode(body, 'gbk');
        //console.log(body);
        processCodeList( body );
      }
    });          
    res.end("done");
  }
);

app.get('/allData', 
  function (req, res){
    pool.query( "SELECT DISTINCT(CONCAT(c.code , ',', c.name)) AS code_name FROM tbl_daily d, tbl_code c WHERE c.code = d.code", function (err, outerRows){
      let retList = [];
      let processed = 0;
      outerRows.forEach( row => {
        let [code,name] = row.code_name.split(",");
        pool.query( "select high, low, close, volume from tbl_daily where code = ? order by date asc", 
                    [ code ],
                    (err, rows) => {
                      //console.log(err);
                      //console.log(rows);
                      var stkResult = genStk(code, rows);
                      stkResult.name = name;
                      retList.push ( stkResult );
                      processed++;
                      //console.log(`processed=${processed} outerRows.length=${outerRows.length}`);
                      if( processed == outerRows.length) {
                        res.end( JSON.stringify(retList) );
                      }
                    }
        );
        console.log( `${code} ${name}` );
      });
    });
  }
);

function updateDaily(code, backDays = 180){
  console.log(`updating code=${code}`);
  var now = new Date().getTime();
  for( var k = -backDays; k <= 0; k+= 50){
    var end_date = getDate(now);
    var s = now + 1000 * 60 * 60 * 24 * k;
    console.log(`s=${s}`);
    var start_date = getDate(s);
    var url = format( conf.stockDailyUrl, {
      code, start_date, end_date
    });
    console.log("url="+url);
    request(url, function (error, response, body) {
                  if (!error && response.statusCode == 200) {
                    var d = JSON.parse(body);
                    d.data.forEach(
                      function(t){
                        var sql = "insert into tbl_daily (code, date, high, close, low, volume, amount) values (?, ?, ?, ? ,? ,? ,?)";
                        pool.query(sql, [code, t.date, t.high * 100, t.close * 100, t.low * 100, t.volume, t.amount ]);
                    });
                    console.log(body);
                  }
                }
    );
  }
}

new CronJob('0 0 18 * * 1-5', function() {
  console.log('update daily status');
  
  pool.query( "SELECT DISTINCT(code) AS code FROM tbl_daily d", (err, outerRows) => {
    outerRows.forEach( r => updateDaily(r.code, 5) );
  });
   
}, null, true, 'Asia/Shanghai');


function addDailyByName(name, res){
  pool.query("SELECT code from tbl_code where name =?", [name], (err, sqlres) =>{
    if( sqlres.length > 0) {
      updateDaily(sqlres[0].code); 
      res && res.end("OK");
    }else{
      res && res.end("ERROR");
    }
  });
}

app.get('/memo/:code', (req,res) => {
  let code = req.params.code;
  pool.query("select name, code from tbl_code where code=?", [code], (sqlerr1, sqlres1) =>{
    pool.query("select m.memo as memo, m.author as author, m.ts as ts, u.color as color from tbl_memo m, tbl_user u where m.code = ? and u.username = m.author order by m.ts desc", [code], (sqlerr, sqlres) =>{
      res.end(JSON.stringify({
       code,
       name: sqlres1[0].name,
       memos: sqlres
      }));
    });
  });
});

app.get('/latestMemo', (req,res) => {
  pool.query("select c.code as code, c.name as name,  m.memo as memo, m.ts as ts, m.author as author, u.color as color from tbl_memo m , tbl_code c, tbl_user u where u.username = m.author and m.code = c.code order by m.ts desc limit 10", (sqlerr, sqlres) =>{
    if(sqlerr != undefined ) {
      res.end(JSON.stringify(sqlerr));
    }else{
      res.end(JSON.stringify(
       sqlres
      ));
    }
  });
});

app.put('/memo/:code', (req,res) => {
  let code = req.params.code;
  let memo = req.body.memo;
  let author = req.session.user;
  console.log(`code=${code} memo=${memo}`);
  pool.query("insert into tbl_memo (code, memo, author) values (?,?,?)", [code, memo, author], (sqlerr, sqlres) =>{
    if( sqlerr == undefined) {
      res.end("done");  
    }else{
      res.end(JSON.stringify(sqlerr));
    }
  });

});

app.get('/addDailyByName/:name', 
          function (req, res) {
            addDailyByName(req.params.name);
          }
);

app.get('/addDaily/:code', 
          function (req, res) {
            var code = req.params.code;
            if( code.match(/^\d+$/) ) {
              console.log("by code");
              updateDaily(code); 
              res.end("OK");  
            }else{
              console.log("by name");
              addDailyByName(code, res);
            }
          }
   );

var server = app.listen(18081, function () {
   var host = server.address().address
   var port = server.address().port

   console.log("Example app listening at http://%s:%s", host, port)
});

