# Use a lightweight Node.js image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application files
COPY . .

# Expose the default port (will match PORT in .env, default 3000)
EXPOSE 3000

# Create a mount point for persistent data storage
VOLUME [ "/usr/src/app/data" ]

# Start the application
CMD [ "npm", "start" ]
