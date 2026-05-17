const crypto = require('crypto');
let privateKey = '-----BEGIN PRIVATE KEY-----\\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDG3TqivO/Fz0eV\\nPr9LtwwcDsa/eNGROI59aJ7T5njI7pvFkJFUcTiTJkyHQ2INWJ+So05SRjx1TI79\\ntizEZgGvQLwjVOqzYKZl7X6VBzjalJN2qxqu8OpNZ9hhYVQtxM1x2TCkOCh2q4n5\\nTB9P3nSz1OWOuSMIiy5LQSeyfkV7fCZ6z+Iv/Dg+zt18WhWwY+YHS8yCghWYBdP/\\nAToMh7HP36HRSLl4rspUOcRuGndkfosOl/ezY2jYKEyNkF7n74dcZxDk4WWQCyMi\\nLMcTvYexviQ0KiaPGb5MZ4hKw8yAUHrgLTV0O0StU47foOmwuCDGxLTtNReEnR+U\\n61WZ8T7JAgMBAAECggEAHPaRmKwd29iBm3oFEHj7eYapaa+mDhmHnzpCj6gshU9D\\nPrX8hKjszXmxga3NtRXoP8orGQ6Dta3N0aPbx0r4CddKz3aJrFByS7wYSIpBvIwR\\nIiJvg3UxGs76E8zCHtxf86nnTLOlKQt4z+dHVDGZG6vxNyU9tfvXZTx7FKMRaZd8\\nmZq1ygcCnYrY+KUHPNWfjDXfOJcXfLscqdS0FLxn6PfKxWTYfpa5yc3gIMoPSLK+\\nqcr132OoMY/fBZRIBSyuIjRqCs38i6t24vGYW3bVuOnbyjufTiQCnF3InCZ/d5JI\\nQNimmtuh4dExEA9LO2ClFmrJGrPor8tZNhsjRpsTtQKBgQDqap6Uga7HSBfqLB94\\nGYuDGjlHL4m7fmtJo5XdzIv07L9qR1KW9FiB0dpks/0dffA0T5bQJ8jhYu+3jwX+\\nx5K2W1xU20UZ0liYkiO38Go9AqnMWT04+hSG/+WLm/Rz1mq6Am1n2WiT3Mbq08Iz\\nJqgRthQ2y3doxUfi1kZofqfqxwKBgQDZLJ0jLX1n1HrAecYOv3R4cL+3AoAx39EO\\nO/MFGVJ7+NTb3K+FGMgZPNYi2pbKqOUzP5dbdcjVCxB/LWMzpWY/uLFc0cvyOVa/\\nR8ubDts2TqUS2BJNGHwymF8zo7QUkKOzGptsNN9iOBLoFTGiN+N4kx68sMX8iMeL\\nnHBf/CN57wKBgQCf1ApDnxgX7+O+Wk8qh+BDh0G+c38pQ0zLbKnmDGzwler8/5wk\\nKH2gJgEN4FqYHSIFyK4/RqEEa3yeXvnreQ9jHm+Zu9clf/HANQP9igIljwdOuRmx\\nG3GbiiZsRe0qfetO4BDQWb+f8Uv/GFq0nYrCaK7nnVrRKJGW7BodbR34SQKBgQCC\\nbuIdm5ejAaGL8lc6ylAoegca4lyeF7+WXfkSSegZXxRwzDV6qaycQ8aUflZsd03Z\\nHstH+hDZq2CIEXlwLlmf0cxsY/CqlTd9gKBPi3erQUaxb6ZmOVt2g79B44MnistW\\nqZdJQOQdOHJag0ghFpH++9VNHJp8lqXKOvXfIC8qbwKBgQDhkWOkoYTj5Wsu6MC6\\nI45CoTk4M4hxDuL2vTV7fvWXPM3aPuZL5P4ry+VzmadgnhZ2IvhBENUnj+wA2yMS\\nzAWXGc9FcZePaD6IV65CTQCu31RHoIcHIlkJ8KXk3B5aWfsLVBhBzrzUCxOrO3JR\\nRTiK/i5Z1bjS/rfMm+q9ChAHPw==\\n-----END PRIVATE KEY-----\\n';
privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
const beginMarker = '-----BEGIN PRIVATE KEY-----';
const endMarker = '-----END PRIVATE KEY-----';
if (privateKey.includes(beginMarker) && privateKey.includes(endMarker)) {
  let body = privateKey.split(beginMarker)[1].split(endMarker)[0];
  body = body.replace(/\s+/g, '');
  const formattedBody = body.match(/.{1,64}/g)?.join('\n') || body;
  privateKey = `${beginMarker}\n${formattedBody}\n${endMarker}\n`;
}
try {
  crypto.createPrivateKey(privateKey);
  console.log('Valid!');
} catch (e) {
  console.log('Error:', e.message);
}
