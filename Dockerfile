FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
ARG APP_VERSION=0.0.0
ARG APP_BUILD_NUMBER=dev
ARG APP_GIT_SHA=local
ENV APP_VERSION=$APP_VERSION \
    APP_BUILD_NUMBER=$APP_BUILD_NUMBER \
    APP_GIT_SHA=$APP_GIT_SHA
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
ARG APP_VERSION=0.0.0
ARG APP_BUILD_NUMBER=dev
ARG APP_GIT_SHA=local
ENV APP_VERSION=$APP_VERSION \
    APP_BUILD_NUMBER=$APP_BUILD_NUMBER \
    APP_GIT_SHA=$APP_GIT_SHA
LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_GIT_SHA
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY ./instrument.server.mjs /app/
WORKDIR /app
CMD ["npm", "run", "start"]
