var templates = {};

templates["stockMemoHead"] = [
  '<p>',
  '<a href="#">返回</a>',
  '</p>',
  '<p class="h2"><%- name %> (<%- code %>) </p>',
  '<p class="topMemo"></p>',
  '<p class="kchart"></p>',
  '<p class="memo-links">',
    '<a class="icon" href=<%- wencaiUrls["基本情况"]%>>基本情况</a>',
    '<a class="icon" href=<%- wencaiUrls["主力持仓"]%>>主力持仓</a>',
    '<a class="icon" href=<%- wencaiUrls["市盈率"]%>>市盈率</a>',
    '<a class="icon" href=<%- wencaiUrls["市净率"]%>>市净率</a>',
    '<a class="icon" href=<%- wencaiUrls["市销率"]%>>市销率</a>',
  '</p>']
.join("\n");

templates["stockMemoItem"] = [
  '<div data-memoid="<%- memo.id %>" class="memo-item">',
    '<span class="memo-author" style="color:<%- memo.color %>"><%- memo.author%><span class="memo-date"> <%- new Date(memo.ts).format("MM月dd日") %></span>：</span>',
    '<%- memo.memo %> <% if( memo.topTs == undefined ){ %>',
      '<a href="#" class="setTop">置顶</a>',
      '<%}else{%>',
      '<a href="#" class="unsetTop">取消置顶</a>',
      '<%}%>'
    ,
  '</div>'
].join("\n");

templates["latestHead"] = [
  '<div class="h2">最新备注</div>'
].join("\n");

templates["latestItem"] = [
        '<div data-code="<%- memo.code%>" class="latest-memo-item">',
          '<p>',
            '<span> [<span style="color:<%- memo.color%>"><%- memo.author%></span>] <%- memo.memo %> - <%- new Date(memo.ts).format("MM月dd日") %></span>',
            '<a class="latest-stock-href" href="#"><%- memo.name%>(<%- memo.code %>)</a>',
          '</p>',
        '</div>'
].join("\n");

templates["stockBlock"] = [
  '<div data-code="<%- d.code%>" title="<%- d.code%> <%- d.sign<0? "距最高点: " + d.toHigh +"天": "距最低点：" + d.toLow + "天" %>" class="stock-block">',
    '<a class="stock-href" href="#"><%- d.name%> <%- d.code%></a>',
    '<div class="volBarWrap"><div class="volBarHigh"></div><div class="volBarLow"></div></div>',
  '</div>']
.join("\n");
