const { InstanceBase, InstanceStatus, runEntrypoint, TCPHelper } = require('@companion-module/base')

const Pixera = require('./src/Pixera')
const config = require('./src/config')
const actions = require('./src/actions')
const feedbacks = require('./src/feedbacks')

class PixeraInstance extends InstanceBase {
		constructor(internal) {
			super(internal)
			let self = this

			Object.assign(self,{
				...config,
				...actions,
				...feedbacks,
			})
		}

	async init(config) {
		let self = this;
		//action variables
		self.CHOICES_TIMELINENAME = [{label: '',id:0}];
		self.CHOICES_TIMELINEHANDLE = [];
		self.CHOICES_SCREENNAME = [{label: '',id:0}];
		self.CHOICES_SCREENHANDLE = [];
		self.CHOICES_CUENAME = [];
		self.CHOICES_CUEHANDLE = [];
		self.CHOICES_TIMELINEFEEDBACK = [];
		self.CHOICES_FADELIST = [];

		await self.configUpdated(config);
	}

	async configUpdated(config) {
		let self = this;
		//self.log('debug', 'update config');
		if(self.pixera){
			self.pixera.destroy();
		}

		if(config){
			self.config = config;
		}
		if(this.config.host && self.config.port){
			self.pixera = new Pixera(self,self.config);
			// Update the actions
			self.updateActions();
			self.updateStatus(InstanceStatus.Ok);
		}
		else{
			self.updateStatus(InstanceStatus.BadConfig,'Missing required values.');
		}
	}
}
runEntrypoint(PixeraInstance, [])
