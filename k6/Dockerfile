FROM golang:1.18.1 as builder
# RUN CGO_ENABLED=0 go install -a -trimpath -ldflags "-s -w -X go.k6.io/k6/lib/consts.VersionDetails=$(date -u +"%FT%T%z")/$(git describe --always --long --dirty)"
RUN go install -trimpath go.k6.io/xk6/cmd/xk6@latest
RUN xk6 build --output /k6 --with github.com/grafana/xk6-distributed-tracing@latest


# COPY ./tests ./tests

FROM grafana/k6:latest
COPY --from=builder /k6 /usr/bin/k6