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
var compression = require('compression')
var _und = require('underscore');

var jsonfile = require('jsonfile')
var file = 'conf.json'
var conf = jsonfile.readFileSync(file);
var poolSpec = conf.pool;
var stockListUrl = conf.stockListUrl;
console.log("read file" + JSON.stringify( poolSpec ));

var pool = mysql.createPool( poolSpec );
 
var express = require('express');
var app = express();

function shouldCompress (req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false
  }

  // fallback to standard filter function
  let r = compression.filter(req, res);
  //console.log("r=" + r);
  return r;
}

var sessionConf = conf.sessionConf;
sessionConf.store = new MySQLStore({}, pool);
app.use(compression({filter: shouldCompress}))
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
  let maxVol = Math.max.apply(null, rows.map( r => r.volume ));
  let high = Math.max.apply(null, rows.map( r => r.high ));
  //console.log(`high=${high}`);

  let minVol = Math.min.apply(null, rows.map( r => r.volume) );
  let low = Math.min.apply(null, rows.map( r => r.low) );
  
  let curVol = rows[rows.length - 1].close;
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
    maxVolLevel: maxVol / avgVol,
    minVolLevel: minVol / avgVol,
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

function fuquan(lines, code){
  let k = 10; //做个保护，避免bug死循环
  // if( code == '603012') {
  //   console.log(lines);  
  // }
    
  let foundFuquanDian = false;
  do{
    foundFuquanDian = false;
    for(let i=lines.length-1; i>0; i--) {
      // if( code == '603012') {
      //   console.log(lines[i]);  
      // }
      let openToday = lines[i].open;
      let closeYesterday = lines[i-1].close;
      // if( code == '603012') {
      //   console.log(`openToday = ${openToday} closeYesterday = ${closeYesterday}`);  
      // }
      //股价波动过大，应该发生了除权
      let r = (closeYesterday-openToday) / closeYesterday;

      if( r > 0.12 ) {
        console.log(`found fuquandian ${lines[i].date} for ${code}`)
        let ratio = (openToday * 1.0/ closeYesterday);
        
        //找到了复权点
        foundFuquanDian = true;

        //将该日期之前的价格都做复权处理
        for( let j=i-1; j>=0; j--) {
          lines[j].open *= ratio;
          lines[j].close *= ratio;
          lines[j].high *= ratio;
          lines[j].low *= ratio;
          lines[j].volume /= ratio;
        }
        break;
      }
    }
  }while(k-- >= 0 && foundFuquanDian == true);
}

app.get('/updateProgress', (req, res) => {
  pool.query("SELECT DISTINCT(code) from tbl_daily", (serr, sres) => {
    let count = sres.length;
    var now = new Date().getTime() - 1000 * 60 * 60 * 8; //8 hours
    var dt = getDate(now);
    res.writeHead(200, {
      "Content-Type": "application/json"
    });
    if( serr == undefined ) {
      pool.query("SELECT DISTINCT(code) from tbl_daily where date = ?", [dt], (serr2, sres2) => {
        if( serr2 == undefined ) {
          res.end(JSON.stringify({
            status: "OK",
            count,
            updated: sres2.length
          }));
        }else{
          res.end(JSON.stringify({
            status: "ERROR",
            msg: JSON.stringify(serr2)
          }));
        }
      });
    }else{
      res.end(JSON.stringify({
        msg: JSON.stringify(serr),
        status: "ERROR"
      }));
    }
  })
});

app.get('/allData', 
  function (req, res){
    pool.query( "SELECT DISTINCT(CONCAT(c.code , ',', c.name)) AS code_name FROM tbl_daily d, tbl_code c WHERE c.code = d.code", function (err, outerRows){
      let retList = [];
      let processed = 0;
      let doFuquan = true;
      var now = new Date().getTime();
      var dt = getDate(now - 1000 * 60 * 60 * 24 * 180);  //half year
      console.log("from dt = " + dt);
      outerRows.forEach( row => {
        let [code,name] = row.code_name.split(",");
        pool.query( "select date, open, high, low, close, volume from tbl_daily where code = ? and date > ? order by date asc", 
                    [ code, dt ],
                    (err, rows) => {
                      //console.log(err);
                      //console.log(rows);
                      if( doFuquan ) {
                        //console.log("fuquaning for code " + code);
                        fuquan(rows, code);
                      }
                      var stkResult = genStk(code, rows);
                      stkResult.name = name;
                      retList.push ( stkResult );
                      processed++;
                      //console.log(`processed=${processed} outerRows.length=${outerRows.length}`);
                      if( processed == outerRows.length) {
                        res.writeHead(200, {
                          "Content-Type": "application/json"
                        });
                        res.end( JSON.stringify(retList) );
                      }
                    }
        );
        console.log( `${code} ${name}` );
      });
    });
  }
);

function getMarket(code){
  var c = code.substring(0,1);
  if( c == "0" || c == "2" || c == "3") {
    return "sz";
  }else{
    return "sh";
  }
}
function updateDaily(code, backDays = 180){
  console.log(`updating code=${code}`);
  var now = new Date().getTime();

  //复权价格数据
  var urlFuquan = format( conf.stockFuquanUrl, { market: getMarket(code), code});
  request(urlFuquan, function(error, response, body) {
    body = body.replace(/\/\*.*\*\//, "");
    var r;
    var reg = /_(\d{4})_(\d{2})_(\d{2}):"([^"]+)"/g;
    var data = [];
    while( r = reg.exec(body)){
      //console.log(`parsed: ${r[1]} ${r[2]} ${r[3]} ${r[4]}`);
      let dt = `${r[1]}-${r[2]}-${r[3]}`;
      let fPrice = r[4];
      // pool.query("insert into tbl_fuquan(code, date, fPrice) values(?,?,?)", [code, dt, fPrice], (serr, sres) =>{
      //   if( serr != null) {
      //     //should update
      //     pool.query("update tbl_fuquan set fPrice=? where code=? and date=?", [fPrice, code, dt]);
      //   }
      // });
      data.push([code, dt, fPrice]);
    }
    pool.query("delete from tbl_fuquan where code=?", [code]);
    pool.query("insert into tbl_fuquan(code, date, fPrice) values ?", [data]);
  });

  for( var k = -backDays; k <= 0; k+= 50){
    var end_date = getDate(now);
    var s = now + 1000 * 60 * 60 * 24 * k;
    console.log(`s=${s}`);
    var start_date = getDate(s);
    var url = format( conf.stockDailyUrl, {
      code, start_date, end_date
    });
    console.log("url="+url);

    //日线数据
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var d = JSON.parse(body);
        if( d.data ){
          d.data.forEach(
            function(t){
              var sql = "insert into tbl_daily (code, date, high, low, open, close, volume, amount) values (?, ?, ?, ? ,? ,? , ?, ?)";
              pool.query(sql, [code, t.date, t.high * 100, t.low * 100, t.open * 100, t.close * 100, t.volume, t.amount], (serr, sres) =>{
                if( serr != null ) {
                  //should update
                  let sql_update = "update tbl_daily set high=?, low=?, open=?, close=?, volume=?, amount=? where code=? and date=? "
                  pool.query(sql_update, [t.high * 100, t.low * 100, t.open * 100, t.close * 100,  t.volume, t.amount, code, t.date ]);
                }else{
                  //nothing to do
                }
              });
          });
        }
      }
      console.log(body);
    });
  }
}


function updateAll(days){
  var updatedCodeList = [];
  var now = new Date().getTime() - 1000*60*60*8; // 8 hours
  var dt = getDate(now);
  pool.query( "SELECT distinct(code) as code FROM stock.tbl_daily where date = ?", [dt], (serr, sres) => {
    sres.forEach( c => {
      updatedCodeList.push(c.code);
    });

    console.log("updatedCodeList=" + updatedCodeList);

    pool.query( "SELECT DISTINCT(code) AS code FROM tbl_daily d", (err, outerRows) => {
    //pool.query( "SELECT distinct(code) FROM stock.tbl_daily where open is null", (err, outerRows) => {
      let hInterval = 0;
      let pos = 0;
      let toUpdate = _und.filter( outerRows, r => !_und.contains(updatedCodeList, r.code));
      let toUpdateCodeList = _und.map( toUpdate, r => r.code);
      console.log("toUpdateCodeList=" + toUpdateCodeList);
      hInterval = setInterval( () => {
        let code = toUpdate[pos++].code;
        if( _und.contains(updatedCodeList, code) ) {
          console.log("skip updated code " + code);
        }else{
          console.log("updating code " + code);
          updateDaily(code, days);
          if( pos >= toUpdate.length) {
            clearInterval(hInterval);
          }
        }
      }, 30000);
    });    
  });
}

app.get("/updateAll/:days", (req, res) =>{
  console.log('update long term daily status');
  var days = req.params.days;
  updateAll(days);  
  res.end("running");
});

new CronJob('0 5 18-19 * * 1-5', function() {
  let x = 5;
  console.log('update daily status');
  updateAll(x);
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
    pool.query("select m.topTs as topTs, m.id as id, m.memo as memo, m.author as author, m.ts as ts, u.color as color from tbl_memo m, tbl_user u where m.code = ? and u.username = m.author order by m.ts desc", [code], (sqlerr, sqlres) =>{
      res.writeHead(200, {
          "Content-Type": "application/json"
      });
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
      res.writeHead(200, {
        "Content-Type": "application/json"
      });
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


app.get('/setTop/:id', (req,res) => {
  let memoId = req.params.id;
  let now = new Date().getTime();
  console.log(`set top memoId=${memoId}`);
  pool.query("update tbl_memo set topTs = FROM_UNIXTIME(?) where id=? ", [now / 1000, memoId], (sqlerr, sqlres) =>{
    if( sqlerr == undefined) {
      res.end("done");  
    }else{
      res.end(JSON.stringify(sqlerr));
    }
  });
});

app.get('/unsetTop/:id', (req,res) => {
  let memoId = req.params.id;
  let now = new Date().getTime();
  console.log(`set top memoId=${memoId}`);
  pool.query("update tbl_memo set topTs = null where id=? ", [memoId], (sqlerr, sqlres) =>{
    if( sqlerr == undefined) {
      res.end("done");  
    }else{
      res.end(JSON.stringify(sqlerr));
    }
  });
});

app.get('/daily/:code', (req,res) => {
  let code = req.params.code;
  console.log(`code=${code}`);
  var now = new Date().getTime();
  var dt = getDate(now - 1000 * 60 * 60 * 24 * 180);  //half year
  pool.query( "select date, open, close, low, high, volume, amount from tbl_daily where code = ? and date > ? order by date asc",
    [ code, dt],
    (sqlerr, sqlres) => {
      if( sqlerr == undefined) {
        fuquan(sqlres, code);
        res.writeHead(200, {
          "Content-Type": "application/json"
        });
        res.end( JSON.stringify(sqlres) );    
      }else{
        res.end("error " + JSON.stringify(sqlerr) );
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

