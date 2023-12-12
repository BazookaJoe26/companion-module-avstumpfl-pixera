const { instanceStatus, TCPHelper } = require('@companion-module/base');
const { forEach } = require('lodash');
const { isIP } = require('net');

class Pixera {
	constructor(instance, config) {
		this.instance = instance;
		let self = instance;
		//buffer for receive stream
		if (isIP(config.host) !== 4) {
			self.log('error', self.config + ' is not a valid IP');
			return;
		}
		if (config.host) {
			this.socket = new TCPHelper(config.host, config.port);
			this.socket.on('status_change', function (status, message) {
				self.updateStatus(status, message);
			});

			this.socket.on('disconnect', function (err) {
				self.log('error', 'Network error: ' + err.message);
				clearInterval(self.retry_interval);
				clearInterval(self.getSelectedTimelines);
			});

			this.socket.on('error', function (err) {
				self.log('error', 'Network error: ' + err.message);
				clearInterval(self.retry_interval);
				clearInterval(self.getSelectedTimelines);
			});

			this.socket.on('close', function () {
				self.log('debug', 'Close Connection.');
				clearInterval(self.retry_interval);
				clearInterval(self.getSelectedTimelines);
			});
			this.socket.on('connect', () => {
				self.log('info', 'Pixera Connected');
				//use version to filter commands
				this.send(1, 'Pixera.Utility.getApiRevision');
				//send message to get reply
				this.sendParams(99, 'Pixera.Utility.setShowContextInReplies', {
					doShow: true,
				});
				self.initFeedbacks();
				this.initVariables();
				this.initLiveSystems();
				this.initOutputs();
				this.initStudioCameras();
				this.initProjectors();
				this.initResources();
				this.initResourceFolders();
				/*this.initTranscodingFolders();*/
				this.initTimelines();
				this.initScreens();
				if (self.config.polling) {
					//self.log('debug',config.polling_rate);
					self.retry_interval = setInterval(
						this.retry.bind(this),
						config.polling_rate
					); //ms for pool timelinestate
					this.retry();
				}
				self.getSelectedTimelines = setInterval(
					this.getSelectedTimeline.bind(this),
					100
				); //ms for pool selected Timelines
				this.getSelectedTimeline();
			});
			this.socket.on('data', (chunk) => {
				const header = 'pxr1';
				if (chunk.toString('utf8', 0, 4) == header) {
					let splitChunk = chunk.toString('utf8').split('pxr1');
					splitChunk.forEach((element) => {
						if (!element) return;
						let data = element.substring(4, element.length).trim();
						//self.log('debug', data);
						this.processReceivedData(data);
					});
				}
			});
		}
	}
	destroy() {
		let self = this.instance;
		clearInterval(self.retry_interval);
		clearInterval(self.getSelectedTimelines);
		if (this.socket) {
			this.socket.destroy();
			delete this.socket;
		}
	}
	generateCommand(id, method, params) {
		let self = this.instance;
		if (id == undefined || !method) {
			self.log('error', 'missing method or id in generate');
			return;
		}
		let command = {
			jsonrpc: '2.0',
			id: id,
			method: method,
		};
		if (params) {
			command.params = params;
		}
		return command;
	}
	send(id, method) {
		if (id == undefined || !method) {
			self.log('error', 'missing id,method or param in send');
			return;
		}
		this.sendParams(id, method, null);
	}
	sendParams(id, method, params) {
		let self = this.instance;
		if (id == undefined || !method) {
			self.log('error', 'missing id,method or param in sendParams');
			self.log('debug', id + ' - ' + method + ' - ' + params);
			return;
		}
		let msg = this.generateCommand(id, method, params);
		let sendBuffer = this.prependHeader(JSON.stringify(msg));
		if (sendBuffer) {
			this.sendBuffer(sendBuffer);
		}
	}
	prependHeader(body) {
		let self = this;
		var result = [];

		for (let i = 0; i < body.length; i++) {
			let hex = body.charCodeAt(i).toString(16);
			result = result.concat(this.roughScale(hex, 16));
		}

		var preHeader = [112, 120, 114, 49, body.length, 0, 0, 0];
		const buf = Buffer.from(preHeader.concat(result));
		return buf;
	}
	roughScale(x, base) {
		var parsed = parseInt(x, base);
		if (isNaN(parsed)) {
			return 0;
		}
		return parsed;
	}
	sendBuffer(cmd) {
		let self = this.instance;
		//enable this for debugging to see send out commands
		//self.log('debug', cmd.toString('utf8'));
		if (this.socket && this.socket.isConnected) {
			this.socket.send(cmd);
		} else {
			self.log('error', 'Pixera not connected. Can not send command');
		}
	}
	pool() {
		let self = this.instance;
		this.send(10000, 'Pixera.Utility.pollMonitoring');
	}
	getSelectedTimeline() {
		let self = this.instance;
		this.send(10001, 'Pixera.Timelines.getTimelinesSelected');
	}
	retry() {
		let self = this.instance;
		this.pool();
	}
	initLiveSystems() {
		let self = this.instance;
		this.send(15, 'Pixera.LiveSystems.getLiveSystems');
	}
	initOutputs() {
		let self = this.instance;
		this.send(21, 'Pixera.LiveSystems.getLiveSystems');
	}
	initStudioCameras() {
		let self = this.instance;
		this.send(17, 'Pixera.Screens.getStudioCameras');
	}
	initProjectors() {
		let self = this.instance;
		this.send(19, 'Pixera.Projectors.getProjectors');
		this.send(20, 'Pixera.Projectors.getProjectorNames');
	}
	initResources() {
		let self = this.instance;
		this.send(35, 'Pixera.Resources.getResources');
	}
	initResourceFolders() {
		let self = this.instance;
		this.send(48, 'Pixera.Resources.getResourceFolders');
	} /*
  initTranscodingFolders(){
    let self = this.instance;
		this.send(51,'Pixera.Resources.getTranscodingFolders');
  }*/
	initTimelines() {
		let self = this.instance;
		this.send(11, 'Pixera.Timelines.getTimelines');
	}
	initVariables() {
		let self = this.instance;

		self.CHOICES_LIVESYSTEMNAME = [{ label: '', id: 0 }];
		self.CHOICES_LIVESYSTEMHANDLE = '';
		self.CHOICES_OUTPUTNAME = [{ label: '', id: 0 }];
		self.CHOICES_OUTPUTHANDLE = [];
		self.CHOICES_STUDIOCAMERANAME = [{ label: '', id: 0 }];
		self.CHOICES_STUDIOCAMERAHANDLE = [];
		self.CHOICES_PROJECTORNAME = [{ label: '', id: 0 }];
		self.CHOICES_PROJECTORHANDLE = [];
		self.CHOICES_RESOURCENAME = [{ label: '', id: 0 }];
		self.CHOICES_RESOURCEHANDLE = [];
		self.CHOICES_RESOURCEFOLDERNAME = [{ label: '', id: 0 }];
		self.CHOICES_RESOURCEFOLDERHANDLE = [];
		/*
    self.CHOICES_TRANSCODEFOLDERNAME = [{label: '',id:0}]
    */
		self.CHOICES_TIMELINENAME = [{ label: '', id: 0 }];
		self.CHOICES_TIMELINEHANDLE = [];
		self.CHOICES_TIMELINEFEEDBACK = [];
		self.CHOICES_SCREENNAME = [{ label: '', id: 0 }];
		self.CHOICES_SCREENHANDLE = [];
		self.CHOICES_CUENAME = [];
		self.CHOICES_CUEHANDLE = [];
		self.CHOICES_FADELIST = [];
		self.SELECTEDTIMELINES = [];

		self.INDEX_LIVESYSTEM = 0;
		self.INDEX_STUDIOCAMERA = 0;
		self.INDEX_OUTPUT = 0;
		self.INDEX_RESOURCE = 0;
		self.INDEX_RESOURCEFOLDER = 0;
	}
	initScreens() {
		let self = this.instance;
		this.send(13, 'Pixera.Screens.getScreens');
		this.send(14, 'Pixera.Screens.getScreenNames');
	}
	processReceivedData(data) {
		let self = this.instance;
		try {
			let jsonData = JSON.parse(data);
			if (jsonData.id == undefined) {
				self.log('debug', 'id is missing in rec data: ' + data);
				return;
			}
			switch (jsonData.id) {
				case 0: //none
					break;

				case 1: //set version
					{
						let result = jsonData.result;
						self.VERSION = result;
					}
					break;

				case 11: //get timeline list
					{
						let result = jsonData.result;
						self.CHOICES_TIMELINEHANDLE = result;
						self.CHOICES_TIMELINEHANDLE.push(-1);
						for (let i = 0; i < result.length; i++) {
							//set feedback timeline array
							self.CHOICES_TIMELINEFEEDBACK.push({
								handle: result[i],
								timelineTransport: '0',
								timelinePositions: '0',
								timelineCountdowns: '0',
								name: '0',
								fps: '0',
							}); //set timeline variable for feedback
							//get attributes for each timeline
							this.sendParams(12, 'Pixera.Timelines.Timeline.getAttributes', {
								handle: result[i],
							});
						}
						self.updateActions();
					}
					break;
				case 12: //get timeline attributes
					{
						//self.log('debug', 'timeline infos: ' + data);

						let result = jsonData.result;
						let context = jsonData.context;
						let handle = context['handle'];
						for (var i = 0; i < self.CHOICES_TIMELINEHANDLE.length; i++) {
							if (self.CHOICES_TIMELINEHANDLE[i] == handle) {
								if (handle == -1) {
									self.CHOICES_TIMELINENAME.push({
										label: 'Selected Timeline',
										id: self.CHOICES_TIMELINEHANDLE[i],
									}); //set timeline name for dropdown menu
								}
								self.CHOICES_TIMELINENAME.push({
									label: result['name'],
									id: self.CHOICES_TIMELINEHANDLE[i],
								}); //set timeline name for dropdown menu
								break;
							}
						}
						for (var k = 0; k < self.CHOICES_TIMELINEFEEDBACK.length; k++) {
							if (self.CHOICES_TIMELINEFEEDBACK[k]['handle'] == handle) {
								self.CHOICES_TIMELINEFEEDBACK[k]['name'] = result['name']; //set timeline name for feedback
								self.CHOICES_TIMELINEFEEDBACK[k]['fps'] = result['fps']; //set timeline fps for feedback
							}
						}
						self.updateActions();
					}
					break;
				case 13: //Pixera.Screens.getScreens
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_SCREENHANDLE = result;
						}
						self.updateActions();
					}
					break;
				case 14: //Pixera.Screens.getScreenNames
					{
						let result = jsonData.result;
						if (result != null) {
							for (var i = 0; i < result.length; i++) {
								self.CHOICES_SCREENNAME.push({
									label: result[i],
									id: self.CHOICES_SCREENHANDLE[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 15: //Pixera.LiveSystems.getLiveSystems
					{
						let result = jsonData.result;
						self.INDEX_LIVESYSTEM = 0;
						if (result != null) {
							self.CHOICES_LIVESYSTEMHANDLE = result;
							for (let i = 0; i < result.length; i++) {
								this.sendParams(16, 'Pixera.LiveSystems.LiveSystem.getName', {
									handle: result[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 16: //Pixera.LiveSystems.LiveSystem.getName
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_LIVESYSTEMNAME.push({
								label: result,
								id: self.CHOICES_LIVESYSTEMHANDLE[self.INDEX_LIVESYSTEM],
							});
							self.INDEX_LIVESYSTEM += 1;
						}
						self.updateActions();
					}
					break;
				case 17: //Pixera.Screens.getStudioCameras
					{
						let result = jsonData.result;
						self.INDEX_STUDIOCAMERA = 0;
						if (result != null) {
							self.CHOICES_STUDIOCAMERAHANDLE = result;
							for (let i = 0; i < result.length; i++) {
								this.sendParams(18, 'Pixera.Screens.StudioCamera.getName', {
									handle: result[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 18: //Pixera.Screens.StudioCamera.getName
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_STUDIOCAMERANAME.push({
								label: result,
								id: self.CHOICES_STUDIOCAMERAHANDLE[self.INDEX_STUDIOCAMERA],
							});
							self.INDEX_STUDIOCAMERA += 1;
						}
						self.updateActions();
					}
					break;
				case 19: //Pixera.Projectors.getProjectors
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_PROJECTORHANDLE = result;
						}
						self.updateActions();
					}
					break;
				case 20: //Pixera.Projectors.getProjectorNames
					{
						let result = jsonData.result;
						if (result != null) {
							for (var i = 0; i < result.length; i++) {
								self.CHOICES_PROJECTORNAME.push({
									label: result[i],
									id: self.CHOICES_PROJECTORHANDLE[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 21: //Pixera.LiveSystems.getLiveSystems
					{
						let result = jsonData.result;
						if (result != null) {
							for (let i = 0; i < result.length; i++) {
								this.sendParams(
									22,
									'Pixera.LiveSystems.LiveSystem.getEnabledOutputs',
									{ handle: result[i] }
								);
							}
						}
						self.updateActions();
					}
					break;
				case 22: //Pixera.LiveSystems.LiveSystem.getEnabledOutputs
					{
						let result = jsonData.result;
						self.INDEX_OUTPUT = 0;
						if (result != null) {
							for (let i = 0; i < result.length; i++) {
								self.CHOICES_OUTPUTHANDLE.push(result[i]);
								this.sendParams(23, 'Pixera.LiveSystems.Output.getName', {
									handle: result[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 23: //Pixera.LiveSystems.Output.getName
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_OUTPUTNAME.push({
								label: result,
								id: self.CHOICES_OUTPUTHANDLE[self.INDEX_OUTPUT],
							});
							self.INDEX_OUTPUT += 1;
						}
						self.updateActions();
					}
					break;
				case 24: //Pixera.LiveSystems.LiveSystem.getAudioMasterMute
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(
								0,
								'Pixera.LiveSystems.LiveSystem.setAudioMasterMute',
								{
									handle: self.LIVESYSTEM_SETAUDIOMASTER_MUTE_LIVESYSTEM,
									channel: self.LIVESYSTEM_SETAUDIOMASTER_MUTE_CHANNEL,
									state: !result,
								}
							);
						}
					}
					break;
				case 25: //Pixera.LiveSystems.Output.getActive
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(0, 'Pixera.LiveSystems.Output.setActive', {
								handle: self.OUTPUT_STATUS_OUTPUT,
								active: !result,
							});
						}
					}
					break;
				case 26: //Pixera.LiveSystems.Output.getIdentify
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(0, 'Pixera.LiveSystems.Output.setIdentify', {
								handle: self.OUTPUT_STATUS_OUTPUT,
								state: !result,
							});
						}
					}
					break;
				case 27: //Pixera.LiveSystems.Output.getIsOutputAggregate
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(
								0,
								'Pixera.LiveSystems.Output.setIsOutputAggregate',
								{ handle: self.OUTPUT_STATUS_OUTPUT, state: !result }
							);
						}
					}
					break;
				case 28: //Pixera.Screens.StudioCamera.getTrackingInputPause
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(
								0,
								'Pixera.Screens.StudioCamera.setTrackingInputPause',
								{
									handle: self.SCREEN_STUDIOCAMERA_TRACKING_STUDIOCAMERA,
									pause: !result,
								}
							);
						}
					}
					break;
				case 29: //Pixera.Screens.StudioCamera.getUsePositionPropertiesFromTracking
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(
								0,
								'Pixera.Screens.StudioCamera.setUsePositionPropertiesFromTracking',
								{
									handle: self.SCREEN_STUDIOCAMERA_TRACKING_STUDIOCAMERA,
									pause: !result,
								}
							);
						}
					}
					break;
				case 30: //Pixera.Screens.StudioCamera.getUseRotationPropertiesFromTracking
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(
								0,
								'Pixera.Screens.StudioCamera.setUseRotationPropertiesFromTracking',
								{
									handle: self.SCREEN_STUDIOCAMERA_TRACKING_STUDIOCAMERA,
									pause: !result,
								}
							);
						}
					}
					break;
				case 31: //Pixera.Projectors.Projector.getBlackout
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(0, 'Pixera.Projectors.Projector.setBlackout', {
								handle: self.PROJECTOR_BLACKOUT_PROJECTOR,
								isActive: !result,
							});
						}
					}
					break;
				case 32: //Pixera.Timelines.Timeline.createLayer
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(0, 'Pixera.Timelines.Layer.setName', {
								handle: result,
								name: self.CREATE_LAYER_NAME,
							});
						}
					}
					break;
				case 33: //Pixera.Timelines.Timeline.CueHandle -> Pixera.Timelines.Cue.blendToThis
					{
						let result = jsonData.result;
						let context = jsonData.context;
						let handleTimeline = context['handle'];
						let fps = 60;
						if (result != null) {
							for (let k = 0; k < self.CHOICES_TIMELINEFEEDBACK.length; k++) {
								if (
									self.CHOICES_TIMELINEFEEDBACK[k]['handle'] ==
										handleTimeline &&
									self.CHOICES_TIMELINEFEEDBACK[k]['fps'] != 0
								) {
									fps = self.CHOICES_TIMELINEFEEDBACK[k]['fps'];
									break;
								}
							}
							let time = self.CHOICES_BLENDNAME_FRAMES / fps;
							/*this.sendParams(0,'Pixera.Timelines.Cue.blendToThis',{'handle':result,'blendDurationInSeconds':time});*/
							this.sendParams(0, 'Pixera.Timelines.Cue.blendToThis', {
								handle: result,
								blendDuration: time,
							});
						}
					}
					break;
				case 34: //Pixera.Timelines.Timeline.getCurrentTime
					{
						let result = jsonData.result;
						if (result != null) {
							let handle = self.TIMELINE_CREATE_CUE_TIMELINEHANDLE;
							let name = self.TIMELINE_CREATE_CUE_NAME;
							let operation = self.TIMELINE_CREATE_CUE_CUEOPERATION;

							this.sendParams(0, 'Pixera.Timelines.Timeline.createCue', {
								handle: handle,
								name: name,
								timeInFrames: result,
								operation: operation,
							});
						}
					}
					break;
				case 35: //Pixera.Resources.getResources
					{
						let result = jsonData.result;
						self.INDEX_RESOURCE = 0;
						if (result != null) {
							for (let i = 0; i < result.length; i++) {
								self.CHOICES_RESOURCEHANDLE.push(result[i]);
								this.sendParams(36, 'Pixera.Resources.Resource.getName', {
									handle: result[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 36: //Pixera.Resources.Resource.getName()
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_RESOURCENAME.push({
								label: result,
								id: self.CHOICES_RESOURCEHANDLE[self.INDEX_RESOURCE],
							});
							self.INDEX_RESOURCE += 1;
						}
						self.updateActions();
					}
					break;
				case 37: //Pixera.Resources.Resource.getUseGradient
					{
						let result = jsonData.result;
						if (result != null) {
							self.log('warn', 'Result: ' + result);
							this.sendParams(0, 'Pixera.Resources.Resource.setUseGradient', {
								handle: self.RESOURCE_SETTINGS_COLOR_RESOURCE,
								useGradient: !result,
							});
						}
					}
					break;
				case 39: //Pixera.Timelines.Layer.getInst -> Pixera.Timelines.Layer.muteLayer
				case 40: //Pixera.Timelines.Layer.getInst -> Pixera.Timelines.Layer.unMuteLayer
				case 41: //Pixera.Timelines.Layer.getInst -> Pixera.Timelines.Layer.muteAudio
				case 42: //Pixera.Timelines.Layer.getInst -> Pixera.Timelines.Layer.unMuteAudio
					{
						let result = jsonData.result;
						let muteMethod = 'Pixera.Timelines.Layer.muteLayer';
						if (jsonData.id == 40) {
							muteMethod = 'Pixera.Timelines.Layer.unMuteLayer';
						} else if (jsonData.id == 41) {
							muteMethod = 'Pixera.Timelines.Layer.muteAudio';
						} else if (jsonData.id == 42) {
							muteMethod = 'Pixera.Timelines.Layer.unMuteAudio';
						}
						this.sendParams(0, muteMethod, { handle: result });
					}
					break;
				case 43: //Pixera.Timelines.Layer.getInst -> Pixera.Timelines.Layer.resetLayer
					{
						let result = jsonData.result;
						if (result != null) {
							this.sendParams(0, 'Pixera.Timelines.Layer.resetLayer', {
								handle: result,
							});
						}
					}
					break;
				case 44: //Pixera.Timelines.Layer.getInst
				case 45: //Pixera.Timelines.Layer.getInst
					{
						self.MUTE_TOGGLE_LAYER = jsonData.result;
						if (jsonData.id == 45) {
							this.sendParams(47, 'Pixera.Timelines.Layer.getIsAudioMuted', {
								handle: self.MUTE_TOGGLE_LAYER,
							});
						} else {
							this.sendParams(46, 'Pixera.Timelines.Layer.getIsLayerMuted', {
								handle: self.MUTE_TOGGLE_LAYER,
							});
						}
					}
					break;
				case 46: //Pixera.Timelines.Layer.getIsLayerMuted
				case 47: //Pixera.Timelines.Layer.getIsAudioMuted
					{
						let result = jsonData.result;
						if (result == true) {
							if (jsonData.id == 46) {
								this.sendParams(0, 'Pixera.Timelines.Layer.unMuteLayer', {
									handle: self.MUTE_TOGGLE_LAYER,
								});
							} else {
								this.sendParams(0, 'Pixera.Timelines.Layer.unMuteAudio', {
									handle: self.MUTE_TOGGLE_LAYER,
								});
							}
						} else {
							if (jsonData.id == 46) {
								this.sendParams(0, 'Pixera.Timelines.Layer.muteLayer', {
									handle: self.MUTE_TOGGLE_LAYER,
								});
							} else {
								this.sendParams(0, 'Pixera.Timelines.Layer.muteAudio', {
									handle: self.MUTE_TOGGLE_LAYER,
								});
							}
						}
					}
					break;
				case 48: //Pixera.Resources.getResourceFolders
					{
						let result = jsonData.result;
						self.INDEX_RESOURCEFOLDER = 0;
						if (result != null) {
							for (let i = 0; i < result.length; i++) {
								this.sendParams(
									49,
									'Pixera.Resources.ResourceFolder.getResourceFolders',
									{ handle: result[i] }
								);
							}
						}
						self.updateActions();
					}
					break;
				case 49: //Pixera.Resources.ResourceFolder.getResourceFolders
					{
						let result = jsonData.result;
						self.INDEX_RESOURCEFOLDER = 0;
						if (result != null) {
							for (let i = 0; i < result.length; i++) {
								self.CHOICES_RESOURCEFOLDERHANDLE.push(result[i]);
								this.sendParams(50, 'Pixera.Resources.ResourceFolder.getName', {
									handle: result[i],
								});
							}
						}
						self.updateActions();
					}
					break;
				case 50: //Pixera.Resources.ResourceFolder.getName()
					{
						let result = jsonData.result;
						if (result != null) {
							self.CHOICES_RESOURCEFOLDERNAME.push({
								label: result,
								id: self.CHOICES_RESOURCEFOLDERHANDLE[
									self.INDEX_RESOURCEFOLDER
								],
							});
							self.INDEX_RESOURCEFOLDER += 1;
						}
						self.updateActions();
					}
					break;
				/*
        case 51: //Pixera.Resources.getTranscodingFolders
        {
          let result = jsonData.result;
          if(result != null){
            for(let i = 0; i < result.length; i++){
              self.CHOICES_TRANSCODEFOLDERNAME.push({label: "TanscodingFolder " + (i + 1), id:result[i]});
            }
          }
          self.updateActions();
        }
        break;
        */

				case 9999: //API
					{
						var result = jsonData.result;
						if (result != null) {
							self.log('info', result);
						}
					}
					break;
				case 10000: //monitoring
					{
						var result = jsonData.result;
						if (result != null) {
							for (var c = 0; c < result.length; c++) {
								if (result[c]['name'] == 'timelineTransport') {
									//transport change
									var timelineTransport = result[c]['entries'];
									for (var b = 0; b < timelineTransport.length; b++) {
										for (
											var t = 0;
											t < self.CHOICES_TIMELINEFEEDBACK.length;
											t++
										) {
											if (
												timelineTransport[b]['handle'] ==
												self.CHOICES_TIMELINEFEEDBACK[t]['handle']
											) {
												self.CHOICES_TIMELINEFEEDBACK[t]['timelineTransport'] =
													timelineTransport[b]['value'];
												self.checkFeedbacks('timeline_state');
												//self.log('debug', 'transport:',self.CHOICES_TIMELINEFEEDBACK);
											}
										}
									}
								} else if (result[c]['name'] == 'timelinePositions') {
									//timeline time
									var timelinePositions = result[c]['entries'];
									for (var b = 0; b < timelinePositions.length; b++) {
										for (
											var t = 0;
											t < self.CHOICES_TIMELINEFEEDBACK.length;
											t++
										) {
											if (
												timelinePositions[b]['handle'] ==
												self.CHOICES_TIMELINEFEEDBACK[t]['handle']
											) {
												self.CHOICES_TIMELINEFEEDBACK[t]['timelinePositions'] =
													timelinePositions[b]['value'];
												self.checkFeedbacks('timeline_positions');
												//self.log('debug', 'positions:',self.CHOICES_TIMELINEFEEDBACK);
											}
										}
									}
								} else if (result[c]['name'] == 'timelineCountdowns') {
									//timeline remain
									var timelineCountdowns = result[c]['entries'];
									for (var b = 0; b < timelineCountdowns.length; b++) {
										for (
											var t = 0;
											t < self.CHOICES_TIMELINEFEEDBACK.length;
											t++
										) {
											if (
												timelineCountdowns[b]['handle'] ==
												self.CHOICES_TIMELINEFEEDBACK[t]['handle']
											) {
												self.CHOICES_TIMELINEFEEDBACK[t]['timelineCountdowns'] =
													timelineCountdowns[b]['value'];
												self.checkFeedbacks('timeline_countdowns');
												//self.log('debug', 'countdowns:',self.CHOICES_TIMELINEFEEDBACK);
											}
										}
									}
								}
							}
						}
					}
					break;
				case 10001:
					{
						var result = jsonData.result;
						if (result != null) {
							self.SELECTEDTIMELINES = result;
						}
					}
					break;
			}
		} catch {
			self.log('error', 'error in rec data');
			self.log('error', data);
		}
	}
}

module.exports = Pixera;
