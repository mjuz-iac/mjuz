FROM mjuz/pulumi:1.0.0

WORKDIR /var/mjuz
COPY . .

ENV PULUMI_AUTOMATION_API_SKIP_VERSION_CHECK=true
ENV PULUMI_CONFIG_PASSPHRASE=PASS
RUN /opt/pulumi/bin/pulumi login --local

RUN sudo chown -R $USER /var/mjuz
RUN yarn config set --home enableTelemetry 0
RUN PATH="/opt/pulumi/bin:$PATH" yarn install
