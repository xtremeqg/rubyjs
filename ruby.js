function is_positive_infinity(buffer) {
	return buffer[0] == 0x69 && buffer[1] == 0x6e && buffer[2] == 0x66;
}

function is_negative_infinity(buffer) {
	return buffer[0] == 0x2d && buffer[1] == 0x69 && buffer[2] == 0x6e && buffer[3] == 0x66;
}

function is_nan(buffer) {
	return buffer[0] == 0x6e && buffer[1] == 0x61 && buffer[2] == 0x6e;
}

function is_string(input) {
	return typeof input == "string";
}

function is_object(value) {
	return typeof vaue === "object" && !Array.isArray(value) && value !== null;
}

module.exports = class Ruby {

	static unmarshal(buffer, options) {
		if (buffer.length < 2) {
			return null;
		}
		const stream = new this();
		stream.options = options ?? {};
		stream.encoding = stream.options.encoding ?? "utf8";
		stream.version = (buffer[0] << 8) | buffer[1];
		stream.offset = 2;
		stream.buffer = buffer;
		stream.symbols = [];
		stream.objects = [];
		return stream.read_value();
	}

	read_value() {
		let instance_variables_follow = false;
		while (true) {
			const type = this.read_uint8();
			if (type == 0x49) {
				if (this.options.verbose) console.log("instance variables follow");
				instance_variables_follow = true;
				continue;
			}
			const value = ((ruby) => {
				switch (type) {
					case 0x22: return ruby.read_string();
					case 0x30: return ruby.read_nil();
					case 0x3a: return ruby.read_symbol();
					case 0x3b: return ruby.read_symbol_ref();
					case 0x40: return ruby.read_object_ref();
					case 0x46: return ruby.read_false();
					case 0x54: return ruby.read_true();
					case 0x5b: return ruby.read_array();
					case 0x66: return ruby.read_float();
					case 0x6f: return ruby.read_object();
					case 0x69: return ruby.read_long();
					case 0x75: return ruby.read_user_defined();
					case 0x7b: return ruby.read_hashmap();
					default: throw new Error(`Unsupported type 0x${type.toString(16)} at offset 0x${(this.offset - 1).toString(16)}`);
				}
			})(this);
			if (instance_variables_follow) {
				const num = this.read_long();
				for (let i = 0; i < num; ++i) {
					const prop_name = this.read_value();
					const prop_value = this.read_value();
					if (is_string(value)) {
						// TODO: actually care about string encoding
						if (this.options.verbose) console.log("encoding", prop_name, prop_value);
					} else if (is_object(value)) {
						value[prop_name] = prop_value;
					} else {
						throw new Error("Type does not support instance variables");
					}
				}
			}
			return value;
		}
	}

	read_nil() {
		if (this.options.verbose) console.log("nil");
		return null;
	}

	read_true() {
		if (this.options.verbose) console.log("true");
		return true;
	}

	read_false() {
		if (this.options.verbose) console.log("false");
		return false;
	}

	read_hashmap() {
		const count = this.read_long();
		const map = {};
		this.objects.push(map);
		for (let i = 0; i < count; ++i) {
			const name = this.read_value();
			const value = this.read_value();
			map[name] = value;
		}
		if (this.options.verbose) console.log("hashmap", count);
		return map
	}

	read_user_defined() {
		const name = this.read_value();
		const buffer = this.read_sequence();
		if (this.options.verbose) console.log("user-defined", name, buffer);
		const object = { classname: name, data: buffer };
		this.objects.push(object);
		return object;
	}

	read_sequence() {
		const length = this.read_long();
		const buffer = Buffer.alloc(length);
		for (let i = 0; i < length; ++i) {
			buffer[i] = this.read_uint8();
		}
		if (this.options.verbose) console.log("sequence", length, buffer);
		return buffer;
	}

	read_float() {
		const buffer = this.read_sequence();
		const value = ((buffer) => {
			if (is_positive_infinity(buffer)) {
				return Number.POSITIVE_INFINITY;
			} else if (is_negative_infinity(buffer)) {
				return Number.NEGATIVE_INFINITY;
			} else if (is_nan(buffer)) {
				return Number.NaN;
			} else {
				return parseFloat(buffer.toString("binary"));
			}
		})(this.buffer);
		this.objects.push(value);
		if (this.options.verbose) console.log("float", value);
		return value;
	}

	read_string() {
		const value = this.read_sequence().toString(this.encoding);
		this.objects.push(value);
		if (this.options.verbose) console.log("string", value);
		return value;
	}

	read_array() {
		const count = this.read_long();
		const array = [];
		this.objects.push(array);
		for (let i = 0; i < count; ++i) {
			array.push(this.read_value());
		}
		if (this.options.verbose) console.log("array", array);
		return array;
	}

	read_object() {
		const object = { classname: this.read_value() };
		this.objects.push(object);
		const count = this.read_long();
		for (let i = 0; i < count; ++i) {
			const prop = this.read_value().substr(1);
			const value = this.read_value();
			object[prop] = value;
		}
		if (this.options.verbose) console.log("object", object);
		return object;
	}

	read_object_ref() {
		const index = this.read_long();
		if (index < 0) {
			throw new Error(`object ref out of range (${index} < 0)`);
		} else if (index >= this.objects.length) {
			throw new Error(`object ref out of range (${index} >= ${this.objects.length})`);
		}
		const object = this.objects[index];
		if (this.options.verbose) console.log("object ref", object);
		return object;
	}

	read_symbol() {
		const symbol = this.read_sequence().toString(this.encoding);
		this.symbols.push(symbol);
		if (this.options.verbose) console.log("symbol", symbol);
		return symbol;
	}

	read_symbol_ref() {
		const index = this.read_long();
		if (index < 0) {
			throw new Error(`symbol ref out of range (${index} < 0)`);
		} else if (index >= this.symbols.length) {
			throw new Error(`symbol ref out of range (${index} >= ${this.symbols.length})`);
		}
		const symbol = this.symbols[index];
		if (this.options.verbose) console.log("symbol ref", symbol);
		return symbol;
	}

	read_long() {
		const b0 = this.buffer[this.offset++];
		const value = ((ruby) => {
			switch (b0) {
				case 0x00: return 0;
				case 0x01: return ruby.read_uint8();
				case 0x02: return ruby.read_uint16();
				case 0x03: return ruby.read_uint24();
				case 0x04: return ruby.read_uint32();
				case 0xfc: return ruby.read_int32();
				case 0xfd: return ruby.read_int24();
				case 0xfe: return ruby.read_int16();
				case 0xff: return ruby.read_int8();
			}
			return (b0 < 128) ? b0 - 5 : b0 - 251;
		})(this);
		if (this.options.verbose) console.log("long", value);
		return value;
	}

	read_uint8() {
		return this.buffer[this.offset++];
	}

	read_uint16() {
		const b1 = this.read_uint8();
		const b2 = this.read_uint8();
		return (b2 << 8) | b1;
	}

	read_uint24() {
		const b1 = this.read_uint8();
		const b2 = this.read_uint8();
		const b3 = this.read_uint8();
		return (b3 << 16) | (b2 << 8) | b1;
	}

	read_uint32() {
		const b1 = this.read_uint8();
		const b2 = this.read_uint8();
		const b3 = this.read_uint8();
		const b4 = this.read_uint8();
		return (b4 << 24) | (b3 << 16) | (b2 << 8) | b1;
	}

	read_int8() {
		const value = this.buffer[this.offset++] - 0x100;
		return value;
	}

	read_int16() {
		const b1 = this.read_uint8();
		const b2 = this.read_uint8();
		return ((b2 << 8) | b1) - 0x10000;
	}

	read_int24() {
		const b1 = this.read_uint8();
		const b2 = this.read_uint8();
		const b3 = this.read_uint8();
		return ((b3 << 16) | (b2 << 8) | b1) - 0x1000000;
	}

	read_int32() {
		const b1 = this.read_uint8();
		const b2 = this.read_uint8();
		const b3 = this.read_uint8();
		const b4 = this.read_uint8();
		return (b4 << 24) | (b3 << 16) | (b2 << 8) | b1;
	}
}
