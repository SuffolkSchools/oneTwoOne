const blockRuleID = 1;

const convertToPromise = (block) => {
	return new Promise((resolve, reject) => {
		try {
			block((...results) => {
				resolve(...results);
			});
		} catch (error) {
			reject(error);
		}

		if (chrome.runtime.lastError) {
			reject(chrome.runtime.lastError);
		}
	});
};

const getEnterpriseAttribute = (item) => {
	return convertToPromise((callback) => {
		if (chrome.enterprise?.deviceAttributes?.[item]) {
			chrome.enterprise.deviceAttributes[item](callback);
		} else {
			callback(undefined);
		}
	});
};

const getIdentity = () => {
	return convertToPromise((callback) => {
		chrome.identity.getProfileUserInfo(callback);
	});
};

const get_data = async (callback) => {
	const requiredData = ["location", "assetid", "directoryid", "useremail"];
	const promises = [
		getEnterpriseAttribute("getDeviceAnnotatedLocation"), // 0 location
		getEnterpriseAttribute("getDeviceAssetId"), // 1 asset id
		getEnterpriseAttribute("getDirectoryDeviceId"), // 2 directory api id
		getIdentity(), // 3 user email
	];

	const results = await Promise.allSettled(promises);

	const data = {};

	for (let i = 0; i < results.length; i++) {
		const value =
			results[i].status === "fulfilled" ? results[i].value : null;

		if (value && requiredData.includes(requiredData[i])) {
			switch (requiredData[i]) {
				case "location":
					data.location = value.toLowerCase().split(",");
					break;
				case "assetid":
					data.assetid = value;
					break;
				case "directoryid":
					data.directoryid = value;
					break;
				case "useremail":
					data.useremail = value.email.toLowerCase();
					break;
			}
		}
	}
	callback(data);
};

const applyBlockingRule = () => {
	chrome.declarativeNetRequest.updateSessionRules(
		{
			addRules: [
				{
					id: blockRuleID,
					priority: 1,
					action: {
						type: "redirect",
						redirect: {
							extensionPath: "/blocked.html",
						},
					},
					condition: {
						urlFilter: "*://*/*",
						resourceTypes: ["main_frame"],
					},
				},
			],
		},
		() => {
			console.log("block rule applied");
		}
	);
};

//Main function that executes from event handlers
const checkDeviceAuthorization = (data) => {
	let blockRule = true;
	if (typeof data.location === "undefined") {
		if (typeof data.directoryid === "undefined") {
			// unmanaged device
			console.log(
				"Couldn't get managed device info. Is this device enrolled in your admin console and device location set? Not blocking anything"
			);
			blockRule = false;
		} else {
			console.log("Empty location, blocking all sites");
			
		}
	} else if (data.location.includes("*")) {
		console.log("Device allows wildcard login, not blocking anything.");
		blockRule = false;
	} else if (data.location.includes(data.useremail)) {
		console.log(
			"Device has this user as allowed to login, not blocking anything."
		);
		blockRule = false;
	} else {
		console.log(
			"Device does not have this user as allowed, BLOCKING ALL WEBSITES!"
		);
	}
	if (blockRule) {
		applyBlockingRule();
	}
};

//EVENTS TO START SERVICE WORKER
//=======================================================
chrome.runtime.onStartup.addListener(function () {
	console.log("determining blocking status on startup.");
	get_data(checkDeviceAuthorization);
});

chrome.runtime.onInstalled.addListener(function () {
	console.log("determining blocking status on install.");
	get_data(checkDeviceAuthorization);
});
