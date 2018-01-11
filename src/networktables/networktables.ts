import { ipcRenderer } from "electron";

class D3Map<T> {
    private map = new Map<string, T>();
    
    static d3_map_escape(key : string) : string {
        return key === '__proto__' || key[0] === '\x00' ? '\x00' + encodeURIComponent(key) : encodeURIComponent(key);
    }

    static d3_map_unescape(key : string) : string {
        return key[0] === '\x00' ? decodeURIComponent(key.slice(1)) : decodeURIComponent(key);
    }

    forEach(f : (string, T) => void) {
        this.map.forEach((v, k) => f(D3Map.d3_map_unescape(k), v));
    }

    get(key : string) : T {
        return this.map[D3Map.d3_map_escape(key)];
    }

    getKeys() : string[] {
        let keys = [];
        this.forEach((key, _) => keys.push(key));
        return keys;
    }

    has(key : string) : boolean {
        return D3Map.d3_map_escape(key) in this.map;
    }

    set(key : string, value : T) {
        this.map[D3Map.d3_map_escape(key)] = value;
    } 
}

export class NetworkTables {
    private keys = {};
    private connectionListeners = [];
    private connected = false;
    private globalListeners = [];
    private keyListeners = {};
    private robotAddress = '127.0.0.1';
    
    constructor() {
        ipcRenderer.send('ready');
        ipcRenderer.on('connected', (ev, con) => {
            this.connected = con;
            this.connectionListeners.map(cb => cb(con));
        });
        ipcRenderer.on('add', (ev, mesg) => {
            this.keys[mesg.key] = { val: mesg.val, valType: mesg.valType, id: mesg.id, flags: mesg.flags, new: true };
            this.globalListeners.map(cb => cb(mesg.key, mesg.val, true));
            if (this.globalListeners.length > 0)
                this.keys[mesg.key].new = false;
            if (mesg.key in this.keyListeners) {
                this.keyListeners[mesg.key].map(cb => cb(mesg.key, mesg.val, true));
                this.keys[mesg.key].new = false;
            }
        });
        ipcRenderer.on('delete', (ev, mesg) => {
            delete this.keys[mesg.key];
        });
        ipcRenderer.on('update', (ev, mesg) => {
            let temp = this.keys[mesg.key];
            temp.flags = mesg.flags;
            temp.val = mesg.val;
            this.globalListeners.map(e => e(mesg.key, temp.val, temp.new));
            if (this.globalListeners.length > 0)
                this.keys[mesg.key].new = false;
            if (mesg.key in this.keyListeners) {
                this.keyListeners[mesg.key].map(e => e(mesg.key, temp.val, temp.new));
                temp.new = false;
            }
        });
        ipcRenderer.on('flagChange', (ev, mesg) => {
            this.keys[mesg.key].flags = mesg.flags;
        });
    }
    
    /**
     * Sets a function to be called when the robot connects/disconnects to the pynetworktables2js server via NetworkTables. It will also be called when the websocket connects/disconnects.
     *
     * When a listener function is called with a ‘true’ parameter, the NetworkTables.getRobotAddress() function will return a non-null value.
     * @param f a function that will be called with a single boolean parameter that indicates whether the robot is connected
     * @param immediateNotify If true, the function will be immediately called with the current robot connection state
     */
    addRobotConnectionListener(f : (connected : boolean) => any, immediateNotify : boolean) {
        this.connectionListeners.push(f);
        if (immediateNotify)
            f(connected);
    }
    
    /**
     * Set a function that will be called whenever any NetworkTables value is changed
     * @param f When any key changes, this function will be called with the following parameters; key: key name for entry, value: value of entry, isNew: If true, the entry has just been created
     * @param immediateNotify If true, the function will be immediately called with the current value of all keys
     */
    addGlobalListener(f : (key : string, value : any, isNew : boolean) => void, immediateNotify : boolean) {
        this.globalListeners.push(f);
        if (immediateNotify) {
            for (let key in this.keys) {
                f(key, this.keys[key].val, this.keys[key].new);
                this.keys[key].new = false;
            }
        }
    }

    /**
     * Set a function that will be called whenever a value for a particular key is changed in NetworkTables
     * @param key A networktables key to listen for
     * @param f When the key changes, this function will be called with the following parameters; key: key name for entry, value: value of entry, isNew: If true, the entry has just been created
     * @param immediateNotify If true, the function will be immediately called with the current value of the specified key
     */
    addKeyListener(key : string, f : (key : string, value : any, isNew : boolean) => void, immediateNotify : boolean) {
        if (key in this.keyListeners) {
            this.keyListeners[key].push(f);
        }
        else {
            this.keyListeners[key] = [f];
        }
        if (immediateNotify && key in this.keys) {
            let temp = this.keys[key];
            f(key, temp.val, temp.new);
        }
    }

    /**
     * Use this to test whether a value is present in the table or not
     * @param key A networktables key
     * @returns true if a key is present in NetworkTables, false otherwise
     */
    containsKey(key : string) : boolean {
        return key in this.keys;
    }

    /**
     * Get all keys in the NetworkTables
     * @returns all the keys in the NetworkTables
     */
    getKeys() : string[] {
        return Object.keys(this.keys);
    }
    /**
     * Returns the value that the key maps to. If the websocket is not open, this will always return the default value specified.
     * @param key A networktables key
     * @param defaultValue If the key isn’t present in the table, return this instead
     * @returns value of key if present, undefined or defaultValue otherwise
     */
    getValue(key : string, defaultValue : any) : any {
        if (key in this.keys) {
            return this.keys[key].val;
        }
        else {
            return defaultValue;
        }
    }
    /**
     * @returns null if the robot is not connected, or a string otherwise
     */
    getRobotAddress() : string | null {
        return connected ? this.robotAddress : null;
    }
    /**
     * @returns true if the robot is connected
     */
    isRobotConnected() : boolean {
        return connected;
    }
    /**
     * Sets the value in NetworkTables. If the websocket is not connected, the value will be discarded.
     * @param key A networktables key
     * @param value The value to set (see warnings)
     * @returns True if the websocket is open, False otherwise
     */
    putValue(key : string, value : any) : boolean {
        if (key in this.keys) {
            this.keys[key].val = value;
            ipcRenderer.send('update', { key, val: value, id: this.keys[key].id, flags: this.keys[key].flags });
        }
        else {
            ipcRenderer.send('add', { key, val: value, flags: 0 });
        }
        return connected;
    }
    /**
     * Creates a new empty map (or hashtable) object and returns it. The map is safe to store NetworkTables keys in.
     * @returns map object, with forEach/get/has/set functions defined. Simlar to a map object when using d3.js
     */
    create_map() : D3Map<any> {
        return new D3Map<any>();
    }
    /**
     * Escapes NetworkTables keys so that they’re valid HTML identifiers.
     * @param key A networktables key
     * @returns Escaped value
     */
    keyToId : (key : string) => string = encodeURIComponent;
    /**
     * Escapes special characters and returns a valid jQuery selector. Useful as NetworkTables does not really put any limits on what keys can be used.
     * @param key A networktables key
     * @returns Escaped value
     */
    keySelector(key : string) : string {
        return encodeURIComponent(key).replace(/([;&,\.\+\*\~':"\!\^#$%@\[\]\(\)=>\|])/g, '\\$1');
    }
}