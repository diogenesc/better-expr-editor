# Stage 1: Build WASM
FROM golang:1.26 AS wasm-builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN GOOS=js GOARCH=wasm go build -o public/expr.wasm ./wasm && \
    cp $(go env GOROOT)/misc/wasm/wasm_exec.js public/

# Stage 2: Build frontend
FROM node:26 AS frontend-builder
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
COPY --from=wasm-builder /src/public/ public/
RUN npm run build

# Stage 3: Build Go server
FROM golang:1.26 AS server-builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /src/dist/ dist/
RUN CGO_ENABLED=0 go build -o expr-editor .

# Stage 4: Runtime
FROM scratch
COPY --from=server-builder /src/expr-editor /expr-editor
EXPOSE 8080
ENTRYPOINT ["/expr-editor"]
