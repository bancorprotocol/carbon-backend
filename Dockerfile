# Use the official lightweight Node.js image, always updated to the latest version.
FROM node:current-alpine

# Set environment variables
ENV NODE_ENV=production

# Install dependencies and tools
RUN apk --no-cache add python3 py3-pip \
    && python3 -m venv /venv \
    && /venv/bin/pip install --no-cache-dir pandas tabulate

# Add virtual environment to the PATH
ENV PATH="/venv/bin:$PATH"

# Set the working directory
WORKDIR /usr/src/app

# Copy only package.json and package-lock.json first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Run the web service on container startup
CMD [ "npm", "run", "start:prod" ]
