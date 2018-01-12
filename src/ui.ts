import { ipcRenderer } from "electron";

import * as nt from "./networktables/networktables";

const NetworkTables = new nt.NetworkTables();

// Define UI elements
class Timer {
    private text : HTMLElement;
    constructor(id : string) {
        this.text = document.getElementById(id);
    }
    tick(time : number) {
        // This is an example of how a dashboard could display the remaining time in a match.
        // We assume here that value is an integer representing the number of seconds left.
        if(time < 0) this.text.innerText = '0:00';
        else {
            const minutes = Math.floor(time / 60);
            const seconds = (time % 60 < 10 ? '0' : '') + time % 60;
            this.text.innerHTML = `${minutes}:${seconds}`;
        }
    }
}
class RobotState {
    private text : SVGTextElement;
    constructor(id : string) {
        this.text = <any>document.getElementById(id).firstChild;
    }

    logState() {
        console.log(this.text.innerHTML);
    }

    connect() {
        this.text.innerHTML = 'Robot connected!';
    }
    disconnect() {
        this.text.innerHTML = 'Robot disconnected.';
    }
}
class Gyro {
    private container : SVGElement;
    private val : number;
    private offset : number;
    private displayVal : number;
    private arm : SVGRectElement;
    private number : SVGTextElement;
    constructor(prefix : string) {
        this.container = <any>document.getElementById(prefix);
        this.val = 0; this.offset = 0; this.displayVal = 0;
        this.arm = <any>document.getElementById(prefix + "-arm");
        this.number = <any>document.getElementById(prefix + "-number");
    }

    set onclick(cb : (this : HTMLElement, ev : MouseEvent) => void) {
        this.container.onclick = <any>cb;
    }

    updateGyro(key : string, value=this.val) {
        this.val = value;
        this.displayVal = Math.floor(this.val - this.offset);
        if (this.displayVal < 0) {
            this.displayVal += 360;
        }
        this.arm.style.transform = `rotate(${this.displayVal}deg)`;
        this.number.innerHTML = `${this.displayVal}º`;
    }

    updateOffset() { this.offset = this.val; }
}
class RobotDiagram {
    private arm : SVGRectElement;
    constructor(prefix : string) {
        this.arm = <any>document.getElementById(prefix + '-arm');
    }

    updateArm(encoderValue : number) {
        // 0 is all the way back, 1200 is 45 degrees forward. We don't want it going past that.
        encoderValue = Math.max(encoderValue, 0);
        encoderValue = Math.min(encoderValue, 1140);
        // Calculate visual rotation of arm
        const armAngle = encoderValue * 3 / 20 - 45;
        // Rotate the arm in diagram to match real arm
        robotDiagram.arm.style.transform = `rotate(${armAngle}deg)`;
    }
}
class Example {
    private button : HTMLButtonElement;
    private readout : HTMLParagraphElement;

    constructor(prefix) {
        this.button = <HTMLButtonElement>document.getElementById(prefix + 'button');
        this.readout = <HTMLParagraphElement>document.getElementById(prefix + 'readout');
    }

    set onclick(cb : (this : HTMLElement, ev : MouseEvent) => void) {
        this.button.onclick = <any>cb;
    }

    update(value : string | boolean) {
        // Sometimes, NetworkTables will pass booleans as strings. This corrects for that.
        if (typeof value === 'string') value = Boolean(value);
        // Set class active if value is true and unset it if it is false
        this.button.classList.toggle('active', value);
        this.readout.innerText = 'Value is ' + value;
    }
}
class Tuning {
    private list : HTMLElement;
    readonly button : HTMLButtonElement;
    private name : HTMLInputElement;
    private value : HTMLInputElement;
    readonly setButton : HTMLButtonElement;
    readonly getButton : HTMLButtonElement;

    constructor(prefix : string) {
        this.list = document.getElementById(prefix);
        this.button = <HTMLButtonElement>document.getElementById(prefix + '-button');
        this.name = <HTMLInputElement>document.getElementById('name');
        this.value = <HTMLInputElement>document.getElementById('value');
        this.setButton = <HTMLButtonElement>document.getElementById('set');
        this.getButton = <HTMLButtonElement>document.getElementById('get');

        this.button.onclick = this.onButtonClick;
        this.setButton.onclick = this.onSetButtonClick;
        this.getButton.onclick = this.onGetButtonClick;
    }

    append(child : HTMLElement) {
        this.list.appendChild(child);
    }

    // Open tuning section when button is clicked
    private onButtonClick() {
        if (this.list.style.display === 'none') {
            this.list.style.display = 'block';
        }
        else {
            this.list.style.display = 'none';
        }
    }

    // Manages get and set buttons at the top of the tuning pane
    private onSetButtonClick() {
        // Make sure the inputs have content, if they do update the NT value
        if (this.name.value && this.value.value) {
            NetworkTables.putValue('/SmartDashboard/' + this.name.value, this.value.value);
        }
    }

    private onGetButtonClick() {
        this.value.value = NetworkTables.getValue(this.name.value);
    }
}
const timer = new Timer('timer');
const robotState = new RobotState('robot-state');
const gyro = new Gyro('gyro');
const robotDiagram = new RobotDiagram('robot');
const example = new Example('example');
const tuning = new Tuning('tuning');
const autoSelect = <HTMLSelectElement>document.getElementById('auto-select');
const armPosition = <HTMLSelectElement>document.getElementById('arm-position');

const address = <HTMLInputElement>document.getElementById('connect-address');
const connect = <HTMLButtonElement>document.getElementById('connect');

// Set function to be called on NetworkTables connect. Usually not necessary.
//NetworkTables.addWsConnectionListener(onNetworkTablesConnection, true);

// Set function to be called when robot dis/connects
NetworkTables.addRobotConnectionListener(onRobotConnection, false);

// Sets function to be called when any NetworkTables key/value changes
NetworkTables.addGlobalListener(onValueChanged, true);

// Function for hiding the connect box
let escCount = 0;
onkeydown = key => {
    if (key.key === 'Escape') {
        setTimeout(() => { escCount = 0; }, 400);
        escCount++;
        if (escCount === 2) document.body.classList.toggle('login-close', true);
    }
    else console.log(key.key);
};

/**
 * Function to be called when robot connects
 * @param {boolean} connected
 */
function onRobotConnection(connected) {
    if (connected) {
        robotState.connect();
        // On connect hide the connect popup
        document.body.classList.toggle('login-close', true);
    }
    else {
        robotState.disconnect();
        // On disconnect show the connect popup
        document.body.classList.toggle('login-close', false);
        // Add Enter key handler
        address.onkeydown = ev => {
            if (ev.key === 'Enter') {
                connect.click();
            }
        };
        // Enable the input and the button
        address.disabled = false;
        connect.disabled = false;
        connect.innerText = 'Connect';
        // Add the default address and select xxxx
        address.value = 'roborio-xxxx.local';
        address.focus();
        address.setSelectionRange(8, 12);
        // On click try to connect and disable the input and the button
        connect.onclick = () => {
            ipcRenderer.send('connect', address.value);
            address.disabled = true;
            connect.disabled = true;
            connect.innerText = 'Connecting';
        };
    }
}

/**** KEY Listeners ****/

// Gyro rotation

NetworkTables.addKeyListener('/SmartDashboard/drive/navx/yaw', gyro.updateGyro);

// The following case is an example, for a robot with an arm at the front.
NetworkTables.addKeyListener('/SmartDashboard/arm/encoder', (key, value) => robotDiagram.updateArm(value));

// This button is just an example of triggering an event on the robot by clicking a button.
NetworkTables.addKeyListener('/SmartDashboard/example_variable', (key, value) => example.update(value));

NetworkTables.addKeyListener('/robot/time', (_, value) => timer.tick(value));

// Load list of prewritten autonomous modes
NetworkTables.addKeyListener('/SmartDashboard/autonomous/modes', (key, value) => {
    // Clear previous list
    while (autoSelect.firstChild) {
        autoSelect.removeChild(autoSelect.firstChild);
    }
    // Make an option for each autonomous mode and put it in the selector
    for (let i = 0; i < value.length; i++) {
        var option = document.createElement('option');
        option.appendChild(document.createTextNode(value[i]));
        autoSelect.appendChild(option);
    }
    // Set value to the already-selected mode. If there is none, nothing will happen.
    autoSelect.value = NetworkTables.getValue('/SmartDashboard/currentlySelectedMode');
});

// Load list of prewritten autonomous modes
NetworkTables.addKeyListener('/SmartDashboard/autonomous/selected', (key, value) => {
    autoSelect.value = value;
});

/**
 * Global Listener that runs whenever any value changes
 * @param {string} key
 * @param value
 * @param {boolean} isNew
 */
function onValueChanged(key, value, isNew) {
    // Sometimes, NetworkTables will pass booleans as strings. This corrects for that.
    if (value === 'true') {
        value = true;
    }
    else if (value === 'false') {
        value = false;
    }
    // The following code manages tuning section of the interface.
    // This section displays a list of all NetworkTables variables (that start with /SmartDashboard/) and allows you to directly manipulate them.
    var propName = key.substring(16, key.length);
    // Check if value is new and doesn't have a spot on the list yet
    if (isNew && !document.getElementsByName(propName)[0]) {
        // Make sure name starts with /SmartDashboard/. Properties that don't are technical and don't need to be shown on the list.
        if (/^\/SmartDashboard\//.test(key)) {
            // Make a new div for this value
            var div = document.createElement('div'); // Make div
            tuning.append(div); // Add the div to the page
            var p = document.createElement('p'); // Make a <p> to display the name of the property
            p.appendChild(document.createTextNode(propName)); // Make content of <p> have the name of the NetworkTables value
            div.appendChild(p); // Put <p> in div
            var input = document.createElement('input'); // Create input
            input.name = propName; // Make its name property be the name of the NetworkTables value
            input.value = value; // Set
            // The following statement figures out which data type the variable is.
            // If it's a boolean, it will make the input be a checkbox. If it's a number,
            // it will make it a number chooser with up and down arrows in the box. Otherwise, it will make it a textbox.
            if (typeof value === 'boolean') {
                input.type = 'checkbox';
                input.checked = value; // value property doesn't work on checkboxes, we'll need to use the checked property instead
                input.onchange = function() {
                    // For booleans, send bool of whether or not checkbox is checked
                    NetworkTables.putValue(key, (<HTMLInputElement>this).checked);
                };
            }
            else if (!isNaN(value)) {
                input.type = 'number';
                input.onchange = function() {
                    // For number values, send value of input as an int.
                    NetworkTables.putValue(key, parseInt((<HTMLInputElement>this).value));
                };
            }
            else {
                input.type = 'text';
                input.onchange = function() {
                    // For normal text values, just send the value.
                    NetworkTables.putValue(key, (<HTMLInputElement>this).value);
                };
            }
            // Put the input into the div.
            div.appendChild(input);
        }
    }
    else {
        // Find already-existing input for changing this variable
        var oldInput = <HTMLInputElement>document.getElementsByName(propName)[0];
        if (oldInput) {
            if (oldInput.type === 'checkbox') oldInput.checked = value;
            else oldInput.value = value;
        }
        else console.log('Error: Non-new variable ' + key + ' not present in tuning list!');
    }
}

// The rest of the doc is listeners for UI elements being clicked on
example.onclick = function() {
    // Set NetworkTables values to the opposite of whether button has active class.
    NetworkTables.putValue('/SmartDashboard/example_variable', this.className != 'active');
};
// Reset gyro value to 0 on click
gyro.onclick = function() {
    // Store previous gyro val, will now be subtracted from val for callibration
    gyro.updateOffset();
    // Trigger the gyro to recalculate value.
    gyro.updateGyro('/SmartDashboard/drive/navx/yaw');
};
// Update NetworkTables when autonomous selector is changed
autoSelect.onchange = function() {
    NetworkTables.putValue('/SmartDashboard/autonomous/selected', (<HTMLSelectElement>this).value);
};
// Get value of arm height slider when it's adjusted
armPosition.oninput = function() {
    NetworkTables.putValue('/SmartDashboard/arm/encoder', parseInt((<HTMLSelectElement>this).value));
};
