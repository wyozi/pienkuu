FROM alpine:latest

LABEL "com.github.actions.name"="pienkuu"
LABEL "com.github.actions.description"="Run pienkuu packager"
LABEL "com.github.actions.icon"="package"
LABEL "com.github.actions.color"="purple"

LABEL "repository"="http://github.com/wyozi/pienkuu"
LABEL "maintainer"="wyozi <wyozi@github.com>"

RUN apk --no-cache add \
  git \
  yarn \
  rsync
  
RUN mkdir /pienkuu
RUN git clone https://github.com/wyozi/pienkuu.git /pienkuu
RUN cd /pienkuu && yarn install

COPY ./entrypoint /entrypoint
RUN chmod +x /entrypoint
ENTRYPOINT ["/entrypoint"]

