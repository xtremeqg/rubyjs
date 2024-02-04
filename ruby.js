
module.exports = class Ruby {

	static unmarshal(buffer, encoding) {
		if (buffer.length < 2) {
			return null;
		}
		const stream = new this();
		stream.encoding = encoding ?? "utf8";
		stream.version = (buffer[0] << 8) | buffer[1];
		stream.offset = 2;
		stream.buffer = buffer;
		stream.symbols = [];
		stream.objects = [];
		return stream.read_value();
	}

	read_value() {
		const type = this.read_uint8();
		switch (type) {
			case 0x22: return this.read_string();
			case 0x30: return null;
			case 0x3a: return this.read_symbol();
			case 0x3b: return this.symbols[this.read_long()];
			case 0x40: return this.objects[this.read_long()];
			case 0x46: return false;
			case 0x49: return this.read_instance_variables();
			case 0x54: return true;
			case 0x5b: return this.read_array();
			case 0x66: return this.read_float();
			case 0x6f: return this.read_object();
			case 0x69: return this.read_long();
			case 0x75: return this.read_user_defined();
			case 0x7b: return this.read_hashmap();
			default: throw new Error(`Unsupported type 0x${type.toString(16)} at offset 0x${(this.offset - 1).toString(16)}`);
		}
	}

	read_hashmap() {
		const count = this.read_long();
		const map = {};
		for (let i = 0; i < count; ++i) {
			const name = this.read_value();
			const value = this.read_value();
			map[name] = value;
		}
		return map
	}

	read_user_defined() {
		const name = this.read_value();
		const buffer = this.read_sequence();
		return { classname: name, data: buffer };
	}

	read_sequence() {
		const length = this.read_long();
		const buffer = Buffer.alloc(length);
		for (let i = 0; i < length; ++i) {
			buffer[i] = this.read_uint8();
		}
		return buffer;
	}

	read_float() {
		const buffer = this.read_sequence();
		if (this.is_positive_infinity(buffer)) {
			return Number.POSITIVE_INFINITY;
		} else if (this.is_negative_infinity(buffer)) {
			return Number.NEGATIVE_INFINITY;
		} else if (this.is_nan(buffer)) {
			return Number.NaN;
		} else {
			return parseFloat(buffer.toString("binary"));
		}
	}

	is_positive_infinity(buffer) {
		return buffer[0] == 0x69 && buffer[1] == 0x6e && buffer[2] == 0x66;
	}

	is_negative_infinity(buffer) {
		return buffer[0] == 0x2d && buffer[1] == 0x69 && buffer[2] == 0x6e && buffer[3] == 0x66;
	}

	is_nan(buffer) {
		return buffer[0] == 0x6e && buffer[1] == 0x61 && buffer[2] == 0x6e;
	}

	read_string() {
		return this.read_sequence().toString(this.encoding);
	}

	read_instance_variables() {
		const value = this.read_value();
		const count = this.read_long();
		const variables = [];
		for (let i = 0; i < count; ++i) {
			variables[this.read_value()] = this.read_value();
		}
		if (variables.E !== true) {
			//~ console.log(variables);
		}
		// ignore instance variables for now
		return value;
	}

	read_array() {
		const count = this.read_long();
		const values = [];
		for (let i = 0; i < count; ++i) {
			values.push(this.read_value());
		}
		return values;
	}

	read_object() {
		const object = { classname: this.read_value() };
		const count = this.read_long();
		for (let i = 0; i < count; ++i) {
			const prop = this.read_value().substr(1);
			const value = this.read_value();
			object[prop] = value;
		}
		this.objects.push(object);
		return object;
	}

	read_symbol() {
		const symbol = this.read_sequence().toString(this.encoding);
		this.symbols.push(symbol);
		return symbol;
	}

	read_long() {
		const b0 = this.buffer[this.offset++];
		switch (b0) {
			case 0x00: return 0;
			case 0x01: return this.read_uint8();
			case 0x02: return this.read_uint16();
			case 0x03: return this.read_uint24();
			case 0x04: return this.read_uint32();
			case 0xfc: return this.read_int32();
			case 0xfd: return this.read_int24();
			case 0xfe: return this.read_int16();
			case 0xff: return this.read_int8();
		}
		return (b0 < 128) ? b0 - 5 : b0 - 251;
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
