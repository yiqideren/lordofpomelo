var pomelo = require('pomelo');
var areaService = require('./app/services/areaService');
var instanceManager = require('./app/services/instanceManager');
var scene = require('./app/domain/area/scene');
var instancePool = require('./app/domain/area/instancePool');
var dataApi = require('./app/util/dataApi');
var routeUtil = require('./app/util/routeUtil');
var playerFilter = require('./app/servers/area/filter/playerFilter');
var ChatService = require('./app/services/chatService');

/**
 * Init app for client
 */
var app = pomelo.createApp();
app.set('name', 'lord of pomelo');

// Configure for production enviroment
app.configure('production', function() {
	// enable the system monitor modules
	app.enable('systemMonitor');
});

// configure for global
app.configure('production|development', function() {
	//var sceneInfo = require('./app/modules/sceneInfo');
	var onlineUser = require('./app/modules/onlineUser');
	if(typeof app.registerAdmin === 'function'){
		//app.registerAdmin(sceneInfo, {app: app});
		app.registerAdmin(onlineUser, {app: app});
	}
	//Set areasIdMap, a map from area id to serverId.
	if (app.serverType !== 'master') {
		var areas = app.get('servers').area;
		var areaIdMap = {};
		for(var id in areas){
			areaIdMap[areas[id].area] = areas[id].id;
		}
		app.set('areaIdMap', areaIdMap);
	}
	// proxy configures
	app.set('proxyConfig', {
		cacheMsg: true,
		interval: 30,
		lazyConnection: true,
		enableRpcLog: true
	});

	// remote configures
	app.set('remoteConfig', {
		cacheMsg: true,
		interval: 30
	});

	// route configures
	app.route('area', routeUtil.area);
	app.route('connector', routeUtil.connector);

	app.loadConfig('mysql', app.getBase() + '/../shared/config/mysql.json');
	app.filter(pomelo.filters.timeout());
});

// Configure for auth server
app.configure('production|development', 'auth', function() {
	// load session congfigures
	app.set('session', require('./config/session.json'));
});

// Configure for area server
app.configure('production|development', 'area', function(){
	app.filter(pomelo.filters.serial());
	app.before(playerFilter());

	//Load scene server and instance server
	var server = app.curServer;
	if(server.instance){
		instancePool.init(require('./config/instance.json'));
		app.areaManager = instancePool;
	}else{
		scene.init(dataApi.area.findById(server.area));
		app.areaManager = scene;
	}

	//Init areaService
	areaService.init();
});

app.configure('production|development', 'manager', function(){
	var events = pomelo.events;

	app.event.on(events.ADD_SERVERS, instanceManager.addServers);

	app.event.on(events.REMOVE_SERVERS, instanceManager.removeServers);
});

// Configure database
app.configure('production|development', 'area|auth|connector|master', function() {
	var dbclient = require('./app/dao/mysql/mysql').init(app);
	app.set('dbclient', dbclient);
	app.load(pomelo.sync, {path:__dirname + '/app/dao/mapping', dbclient: dbclient});
});

app.configure('production|development', 'connector', function(){
	var dictionary = app.components['__dictionary__'];
	var dict = null;
	if(!!dictionary){
		dict = dictionary.getDict();
	}

	app.set('connectorConfig',
		{
			connector : pomelo.connectors.hybridconnector,
			heartbeat : 30,
			useDict : true,
			useProtobuf : true,
			handshake : function(msg, cb){
				cb(null, {});
			}
		});
});

app.configure('production|development', 'gate', function(){
	app.set('connectorConfig',
		{
			connector : pomelo.connectors.hybridconnector,
		});
});
// Configure for chat server
app.configure('production|development', 'chat', function() {
	app.set('chatService', new ChatService(app));
});

//start
app.start();

// Uncaught exception handler
process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});
