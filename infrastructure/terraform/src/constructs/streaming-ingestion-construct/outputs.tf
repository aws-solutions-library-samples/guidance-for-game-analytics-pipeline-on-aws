output "game_events_firehose_name" {
  value       = aws_kinesis_firehose_delivery_stream.game_events_firehose.name
  description = "The name of the Game Events Kinesis Firehose delivery stream"
}

output "game_events_firehose_arn" {
  value       = aws_kinesis_firehose_delivery_stream.game_events_firehose.arn
  description = "The arn of the Game Events Kinesis Firehose delivery stream"
}
