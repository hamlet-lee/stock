$(function(){
  let $screen = $("#screen");
  function foundConflict(poss, p){
    let found = false;
    poss.forEach( (pos) => {
      if( Math.abs( pos.left - p.left ) < 20 && Math.abs(pos.top - p.top ) < 25 ){
        found = true;
      }
    });
    return found;
  }
  function draw(data){
    let s = 0;
    let maxVol=-1000000;
    let minVol=1000000;
    for(let i=0; i<data.length; i++){
      maxVol = Math.max(maxVol, data[ i ].volLevel);
      minVol = Math.min(minVol, data[ i ].volLevel);
    }

    let ww = $("#screen").width()/2;
    let hh = $("#screen").height();

    
    let maxToLow = Math.max.apply(null, data.map( (x) => x.toLow ));
    let maxToHigh = Math.max.apply(null, data.map( (x) => x.toHigh ));
    let dayUnit = $("#screen").width() / (maxToLow + maxToHigh);

    var poss = [];
    var leftMap = {};
    var pos = 0;
    var elemList = [];
    data.forEach( (d) => {
      let $n = $(_.template(templates.stockBlock, {d}) );
        
      let left;
      if (d.sign<0){
        left = d.toHigh * dayUnit;
      }else{
        left = (d.toLow + maxToHigh) * dayUnit ;
      }
      //let left = ww + d.sign * d.level * ww ;
      let top = hh - d.level * hh;
      while( foundConflict(poss, {left, top}) ){
        left += 10;
      }
      poss.push({left, top});
      $n.css({ left, top });
      if( d.sign < 0 ){
        $n.css({
          "border-color":"green",
          "border-width":"1px"
        });
        $n.find(".volBarLow").css("background-color", "green");
      }else{
        $n.css({
          "border-color":"red",
          "border-width":"1px"
        });
        $n.find(".volBarLow").css("background-color", "red");
      }

      let lowPart = (d.volLevel - d.minVolLevel) / (d.maxVolLevel - d.minVolLevel);
      let highPart = 1 - lowPart;
      $n.find(".volBarHigh").css("flex", Math.round(highPart * 10));
      $n.find(".volBarLow").css("flex", Math.round(lowPart * 10));

      let k = Math.floor(255 - 255 * (d.volLevel - minVol) / (maxVol - minVol));
      let c = "rgb("+k+",255,255)";
      console.log(c);
      $n.css("background-color", c);
      $screen.append($n);
      leftMap[pos] = left;
      elemList.push($n);
      pos++;
    });

    var posList = [];
    for( var i=0; i<pos; i++ ){
      posList[i] = i;
    }

    posList = posList.sort( (a,b) => {
      if( leftMap[a] < leftMap[b]) {
        return -1;
      }else if( leftMap[a] > leftMap[b]) {
        return 1;
      }else {
        return 0;
      }
    });

    for( var i=0; i<pos; i++ ) {
      elemList[ posList[i] ].css("z-index", i);
    }
    //$screen.append();
  }

  function drawLatestMemo(data){
    $("#latest").empty();
    
    $("#latest").append( $(_.template(templates.latestHead,{}) ) );
    data.forEach( (memo) => {
      $("#latest").append(_.template(templates.latestItem, {memo}));
    });
  }

  function genWenCai(q){
    return "http://www.iwencai.com/stockpick/search?w="+encodeURIComponent(q);
  }
  function showStockMemo(code){
    $("#memo").fadeOut();
    $.ajax({
      url: "/memo/"+code,
      success: (data) => {
        console.log(data);
        var d = data;
        var memos = d.memos;
        var name = d.name;

        var wencaiUrls = {
          "市盈率": genWenCai(code + " 市盈率"),
          "市净率": genWenCai(code + " 市净率"),
          "市销率": genWenCai(code + " 市销率"),
          "基本情况": genWenCai(code),
          "主力持仓": genWenCai(code + " 主力持仓")
        };

        $("#memo").empty();
        $("#memo").append( $(_.template(templates.stockMemoHead,{name, code, wencaiUrls}) ) );

        memos.forEach( (memo) => {
          if( memo.topTs == undefined ) {
            $("#memo").append(_.template(templates.stockMemoItem, {memo}));
          }else{
            $("#memo").find(".topMemo").append(_.template(templates.stockMemoItem, {memo}));
          }
        });
        var h = _.template('<div data-code="<%- code%>" class="add-memo"> <textarea type="text" class="myMemo"/><button class="btnAddMemo">添加备注</button> </div>',{code});
        $("#memo").append(
          $(h)
        );
        $("#memo").fadeIn();
        let $kchart = $("#memo").find(".kchart");

        $.ajax({
          url: "/daily/" + code,
          method: "GET",
          contentType: 'application/json',
          success: (r) => {
            var res = r;
            var dtList = _.map(res,  r => r.date);
            var kList = _.map(res, r => [r.open / 100, r.close / 100, r.low / 100, r.high / 100] );
            var amountList = _.map(res, r => r.amount);
            kchart($kchart[0], name + " " + code, dtList, kList, amountList);
          }
        })

        $('html, body').animate({
          scrollTop: $("#memo").offset().top,
        }, 0);
      },
      error: (e) => alert(JSON.stringify(e))
    });
  }
	$.ajax({
		url: "/allData",
		method: "GET",
		contentType: 'application/json',
		success: function(res) {
      console.log(res);
      draw(res);
		},
		error: function(xhr, status, error) {
		  var err = xhr.responseText;
		  alert(err);
		}
	});

  $.ajax({
    url: "/latestMemo",
    method: "GET",
    contentType: 'application/json',
    success: function(res) {
      console.log(res);
      drawLatestMemo(res);
    },
    error: function(xhr, status, error) {
      var err = xhr.responseText;
      alert(err);
    }
  });

  $("body").on("click", ".setTop", (e) =>{
    e.preventDefault();
    let id = $(e.target).closest(".memo-item").data("memoid");
    $.ajax({
      url: "/setTop/" + id,
      method: "GET",
      success: (e) => { alert("done"); }
    });
  });



  $("body").on("click", ".unsetTop", (e) =>{
    e.preventDefault();
    let id = $(e.target).closest(".memo-item").data("memoid");
    $.ajax({
      url: "/unsetTop/" + id,
      method: "GET",
      success: (e) => { alert("done"); }
    });
  });

  $("body").on("click",".btnAddMemo", (e) =>{
    let code = $(e.target).closest(".add-memo").data("code");
    let memo = $(e.target).closest(".add-memo").find(".myMemo").val();
    $.ajax({
      url: "/memo/" + code,
      method: "put",
      data: {code, memo},
      success: () => alert('done'),
      error: (e) => alert( JSON.stringify(e))
    });
  });
  $("body").on("click",".stock-href", (e) => {
    let code = $(e.target).closest(".stock-block").data("code");
    console.log("code: " + code);
    e.preventDefault();
    showStockMemo(code);
  });
  
  $("body").on("click",".latest-stock-href", (e)=>{
    let code = $(e.target).closest(".latest-memo-item").data("code");
    e.preventDefault();
    console.log("code: " + code);
    e.preventDefault();
    showStockMemo(code);
  });

  $("#btnAdd").on("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    let code = $("#stkCode").val();
    $.ajax({
      url: '/addDaily/' + code,
      success: () => alert('done'),
      error: (e) => alert(JSON.stringify(e))
    });
  });

  $.ajax({
    url: "/updateProgress",
    method: "GET",
    success: function(data){
      if( data.status == "ERROR" ) {
        $("#status").text("当日数据更新进度: 【查询出错：" + data.msg + "】");
      }else{
        if( data.updated < data.count) {
          $("#status").text("当日数据更新进度: " + data.updated + "/" + data.count);
        }else{
          $("#status").text("当日数据已更新完毕，股票数量：" + data.count);
        }
      }
    }
  });
  
});


window.onerror = function(message, source, lineno, colno, error) {
        alert("line" + lineno+ " " + message);
}
