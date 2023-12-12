# Use the official lightweight Node.js 18 image.
FROM node:18-alpine

ENV NODE_ENV production

# Install Python and pip
RUN apk --no-cache add python3 py3-pip

# Create a virtual environment and activate it
RUN python3 -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Install pandas and tabulate within the virtual environment
RUN pip3 install --no-cache-dir pandas tabulate

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package.json ./

# Install Node.js dependencies
RUN npm install --omit=dev

# Copy local code to the container image.
COPY . ./

# Build the application
RUN npm run build

# Run the web service on container startup.
CMD [ "npm", "run", "start:prod" ]
