# µs gRPC Protocol Buffer Descriptions

Contains all gRPC service descriptions and types, servers and clients generated from them.

They are separated from `@mjuz/core` to be handled as external dependency by Pulumi's function serialization.
Serializing the generated gRPC code breaks it; having it in an external package makes the serialization obsolete.
