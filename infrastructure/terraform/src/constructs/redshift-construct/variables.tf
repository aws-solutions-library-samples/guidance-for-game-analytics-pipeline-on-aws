variable "stack_name" {
  type          = string
  description   = "Name of the stack"
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "game_events_stream_arn" {
  type = string
  description = "ARN of the Kinesis stream for game events"
}

variable "events_database" {
  type        = string
}

variable "vpc_subnet" {
  type        = list(string)
}